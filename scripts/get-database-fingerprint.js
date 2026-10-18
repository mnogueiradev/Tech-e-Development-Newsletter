require('dotenv').config();
const { getDatabaseFingerprint } = require('../repositories/databaseIdentity');

try {
    console.log(getDatabaseFingerprint(process.env.TIDB_URL));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
