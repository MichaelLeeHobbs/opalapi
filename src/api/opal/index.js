const OpalAPI = require('./OpalAPI')

module.exports = async ({app}) => {
    let api = await new OpalAPI()

    app.get('/api/opal/study/report/:accession', async (req, res) => {
        try {
            let study = await api.getStudyWithReportPDF(req.params)
            if (study) res.send(study).end(200)
            else res.end(404)
        } finally {
            res.end(500)
        }
    })
}
