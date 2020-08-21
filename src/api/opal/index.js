const OpalAPI = require('./OpalAPI')

module.exports = async ({app}) => {
    let api = await new OpalAPI()

    app.get('/api/opal/study/report/:accession', async (req, res) => {
        try {
            let study = await api.getStudyWithReportPDF(req.params)
            if (study) res.status(200).send(study).end()
            else res.status(200).end()
        } catch (e) {
            console.error(`Error in "/api/opal/study/report/:accession"`, e)
            res.status(500).end()
        }
    })
}
