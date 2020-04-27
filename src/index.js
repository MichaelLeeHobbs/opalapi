const express = require('express')
const morgan = require('morgan')
const opal = require('./api/opal')
const app = express()

app.use(morgan('combined'))

async function main() {
    // load aws routes
    await opal({app})

    process.env.SERVER_PORT = process.env.SERVER_PORT || 3000
    app.listen(process.env.SERVER_PORT, () => {
        console.log(`Server listening on port ${process.env.SERVER_PORT}`)
    })

}

main().catch(console.error)
