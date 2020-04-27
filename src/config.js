const CONFIG = {
    opalWeb: {
        username: process.env.OPAL_USERNAME,
        password: process.env.OPAL_PASSWORD,
        url: process.env.OPAL_URL || 'OpalWeb',
        host: process.env.OPAL_HOST,
    },
    opalDb: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 1433,
        database: process.env.DB_DATABASE || 'opalrad',
    },
    nodeMailer: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_IS_SECURE ? JSON.parse(process.env.SMTP_IS_SECURE) : true,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    }
}


module.exports = CONFIG
