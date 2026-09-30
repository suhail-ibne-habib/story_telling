const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config()

const app = require('./src/app')

app.listen(`${process.env.PORT || 8000}`, () => {
    console.log("App is listening to port: ", process.env.PORT);
})

