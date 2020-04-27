const OpalAPI = require('./OpalAPI')

module.exports = async ({app}) => {
    let api = await new OpalAPI()

    app.get('/api/opal/study/report/:accession', async (req, res) => {
        try {
            let study = await api.getStudyWithReportPDF(req.params)
            if (study) res.status(200).send(study).end()
            else res.status(404).end()
        } catch {
            res.status(500).end()
        }
    })
}
