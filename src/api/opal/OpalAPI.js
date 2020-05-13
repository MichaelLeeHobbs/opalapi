require('dotenv').config()

const config = require('../../config')
const fetch = require('node-fetch')
const sql = require('mssql')
const {URLSearchParams} = require('url')
const SECOND = 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class OpalAPI {
    constructor() {
        this._username = config.opalWeb.username
        this._password = config.opalWeb.password
        this._session = ''
        this._baseUrl = `https://${config.opalWeb.host}/${config.opalWeb.url}`
        this._host = config.opalWeb.host
        this._cookie = new Map()
        this._cookie.set(`upwd`, this.opalEncode(this._password))
        this._cookie.set(`hippa_${this._username}`, 1)
        this._cookie.set(`uname`, this._username)
        this._isLoggedIn = false
        this._loginHandle = -1

        return this.init()
    }

    async init() {
        this._pool = new sql.ConnectionPool({
            user: config.opalDb.user,
            password: config.opalDb.password,
            server: config.opalDb.host, // You can use 'localhost\\instance' to connect to named instance
            port: Number.parseInt(config.opalDb.port),
            database: config.opalDb.database,
            encrypt: false,             // https://github.com/tediousjs/node-mssql/issues/1014
        })
        await this._pool.connect()
        return this
    }

    stop() {
        this._pool.close()
        sql.close()
    }

    async getStudy({accession, studyID}) {
        console.log(accession, studyID)
        const sqlStmt = `
            SELECT study_id, study_datetime, patient_id,
            (select institution_name from INSTITUTIONS where institution_id = s.institution_id) as institution,
            (select FirstName from PATIENTS where patient_id = s.patient_id) as patientFirstName,
            (select Lastname from PATIENTS where patient_id = s.patient_id) as patientLastName,
            (select status_name from STATUSES where status_id = s.status_id) as status,
            (select study_description from STUDY_DESCRIPTION where study_description_id = s.study_description_id) as studyDescription,
            (select modality from MODALITIES where modality_id = s.modality_id) as modality,
            (select facility_name from facilities where facility_id = s.facility_id) as facility,
            accession_number, stat, study_recvd_ts, reading_physician_id FROM STUDIES s where ${(accession !== undefined) ? 'accession_number = @accession;' : 'study_id = @studyID;'}`
            .trim()

        let request = this._pool.request()
        if (accession !== undefined) request.input('accession', sql.VarChar, accession)
        else request.input('studyID', sql.Int, studyID)
        return request.query(sqlStmt)
    }


    getSessionToken() {
        let url = `${this._baseUrl}/login.aspx`
        let options = this.getOptions({contentType: null})
        return fetch(url, options)
            .then(res => {
                if (res.status !== 200) throw new Error(`Failed to connect! ${res.statusText}`)
                return this._session = res.url.split('/')[4]
            })
    }

    getCookie() {
        let cookie = ''
        this._cookie.forEach((value, key) => cookie += `${key}=${value}; `)
        return cookie
    }

    opalEncode(value) {
        return Buffer.from(Buffer.from(value.toString(), 'utf8').toString('base64'), 'utf8').toString('hex').toUpperCase()
    }

    opalDecode(value) {
        return Buffer.from(Buffer.from(value, 'hex').toString('utf8'), 'base64').toString('utf8')
    }

    getOptions({method = 'GET', data, contentType, referer, contentLength, extraHeaders = []}) {
        // default to application/json unless null
        contentType = contentType === undefined ? 'application/json' : contentType === null ? undefined : contentType
        let headers = {
            "Accept-Language": 'en-US',
            "Accept-Encoding": 'gzip, deflate',
            "Host": config.opalWeb.host,
            "Connection": 'Keep-Alive',
            "connection": 'keep-alive',
            // "Cache-Control": 'no-cache',
            "Accept": '*/*',
            "Cookie": this.getCookie(),
            "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
        }
        if (contentType) headers['Content-Type'] = contentType
        if (referer) headers['Referer'] = referer
        if (contentLength) headers['Content-Length'] = contentLength
        extraHeaders.forEach(header => headers[header[0]] = header[1])
        let body = (contentType === 'application/json') ? JSON.stringify(data) : data
        return {
            headers,
            // "agent": this._proxyAgent,
            method,
            body,
            redirect: 'follow',
            follow: 20,
            timeout: 30000,
            compress: true
        }
    }

    async login(_attempt = 0) {
        let url = `${this._baseUrl}/${await this.getSessionToken()}/LoginHandler.ashx`
        let {username, password} = this
        let data = `USERNAME=${username}&PASSWORD=${password}&rememberme=1&rememberpwd=1`
        let options = this.getOptions({method: 'POST', data, contentType: 'application/x-www-form-urlencoded', referer: url, contentLength: data.length})
        await fetch(url, options).then(async res => this._isLoggedIn = res.status === 200)
        if (!this.isLoggedIn && ++_attempt < 5) {
            await sleep(15 * SECOND)
            return this.login(_attempt)
        }
        this._loginHandle = setInterval(()=>this.getHome(), 180 * SECOND)
        return this.isLoggedIn
    }

    logout() {
        clearInterval(this._loginHandle)
        this._isLoggedIn = false
        this._session = undefined
    }

    async getHome() {
        let url = `${this._baseUrl}/${this._session}/StudyListHome.aspx`
        let options = this.getOptions({method: 'GET', referer: url, contentType: null})
        return fetch(url, options)
    }

    async getDefaultWorkList() {
        let url = `${this._baseUrl}/${this._session}/StudyListProcessor.aspx`
        let params = `?command=CustomFilter&FILTER_ID=&FILTER_NAME=NONE&auto=true&PageNum=1`
        let extraHeaders = [
            ['X-Requested-With', 'XMLHttpRequest'],
            ['Accept-Language', 'en-us'],
        ]
        let options = this.getOptions({method: 'GET', referer: url, contentType: null, extraHeaders})
        return fetch(url + params, options)
    }

    /**
     * Get a study report PDF if found
     * @param studyID
     * @param _attempt
     * @return {Promise<Buffer>}
     */
    async getReport(studyID, _attempt = 0) {
        await sleep(_attempt * SECOND)
        if (!this.isLoggedIn) await this.login()

        return fetch(`${this._baseUrl}/${this._session}/GenerateReport.aspx?CMD=StudyReport&STUDYID=${this.opalEncode(studyID)}`)
            .then(async (res) => {
                // if (res.status === 200) return res.blob()
                if (res.status === 200) return res.buffer()
                else return undefined
            })
            .catch(async (e)=>{
                this.logout()
                if (++_attempt < 5) return this.getReport(studyID, _attempt)
                throw e
            })
    }

    async getStudyWithReportPDF({accession, studyID}) {
        if (!this.isLoggedIn) await this.login()

        let study = await this.getStudy({accession, studyID}).catch((e)=>{
            console.error(e)
            return undefined
        })
        if (!study || !Array.isArray(study.recordset)) return undefined
        study = study.recordset.pop()
        if (!study) return
        let file = await this.getReport(study.study_id)
        study.report = file && file.toString('base64')
        return study
    }

    async getFilteredWorkList(status) {
        let url = `${this._host}/opalweb/${this._session}/StudyListProcessor.aspx`
        // let params = `?command=filterList&filter=STATUS_NAME LIKE 'INCOMPLETE%' AND &filterRetain=STATUS_NAME#@#INCOMPLETE#@#&PageNum=1`
        // let params = `?command=filterList&filter=STATUS_NAME%20LIKE%20%27NOTAPPROVED%25%27%20AND%20&filterRetain=STATUS_NAME%23@%23${status}%23@%23&PageNum=1`
        //               ?command=filterList&filter=STATUS_NAME%20LIKE%20%27NOTAPPROVED%25%27%20AND%20%26&filterRetain=STATUS_NAME%23%40%23NOTAPPROVED%23%40%23&PageNum=1
        // let params = `?command=filterList&filter=STATUS_NAME LIKE '${status}%' AND &filterRetain=STATUS_NAME#@#${status}#@#&PageNum=1`

        let params = new URLSearchParams()
        params.append('command', 'filterList')
        params.append('filter', `STATUS_NAME LIKE '${status}%' AND `)
        params.append('filterRetain', `STATUS_NAME#@#${status}#@#`)
        params.append('PageNum', `1`)
        let extraHeaders = [
            ['X-Requested-With', 'XMLHttpRequest'],
            ['Accept-Language', 'en-us'],
            ['Referer', `${this._host}/opalweb/${this._session}/StudyListHome.aspx`],
        ]
        let options = this.getOptions({method: 'GET', referer: url, contentType: null, extraHeaders})
        let uri = `${url}?${params}`.replace(/\+/g, '%20').replace(/%40/g, '@')
        return request(uri, options)
    }

    get username() {
        return this._username
    }

    get password() {
        return this._password
    }

    get isLoggedIn() {
        return this._isLoggedIn
    }
}

module.exports = OpalAPI
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
