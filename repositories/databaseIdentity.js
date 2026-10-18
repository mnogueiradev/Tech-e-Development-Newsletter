const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getDatabaseFingerprint(connectionString) {
    if (!connectionString) throw new Error('TIDB_URL não configurada.');

    let parsed;
    try {
        parsed = new URL(connectionString);
    } catch {
        throw new Error('TIDB_URL inválida; não foi possível validar a identidade do banco.');
    }

    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (!parsed.hostname || !database) {
        throw new Error('TIDB_URL precisa informar o host e o nome do banco.');
    }

    // O usuário diferencia clusters TiDB que compartilham gateways; a senha e a query nunca entram no hash.
    const user = decodeURIComponent(parsed.username || '');
    const identity = JSON.stringify([user, parsed.hostname.toLowerCase(), parsed.port || '3306', database]);
    return crypto.createHash('sha256').update(identity).digest('hex');
}

function assertExpectedDatabaseFingerprint(
    connectionString,
    expectedFingerprint,
    environment = process.env.NODE_ENV,
    fingerprintFile = process.env.TIDB_FINGERPRINT_FILE
) {
    const actualFingerprint = getDatabaseFingerprint(connectionString);
    const expected = String(expectedFingerprint || '').trim().toLowerCase();

    if (expected && !/^[a-f0-9]{64}$/.test(expected)) {
        throw new Error('TIDB_EXPECTED_FINGERPRINT deve conter os 64 caracteres hexadecimais gerados por npm run db:fingerprint.');
    }

    if (expected && expected !== actualFingerprint) {
        throw new Error(
            `Banco inesperado: fingerprint recebido ${actualFingerprint} não corresponde ao TIDB_EXPECTED_FINGERPRINT configurado.`
        );
    }

    if (environment === 'production') {
        const markerPath = path.resolve(
            fingerprintFile || path.join(os.homedir(), '.newsletter', 'tidb-fingerprint')
        );
        fs.mkdirSync(path.dirname(markerPath), { recursive: true, mode: 0o700 });

        if (expected) {
            // Um valor explícito e correspondente autoriza uma troca intencional de banco.
            fs.writeFileSync(markerPath, `${actualFingerprint}\n`, { mode: 0o600 });
            return actualFingerprint;
        }

        try {
            const savedFingerprint = fs.readFileSync(markerPath, 'utf8').trim().toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(savedFingerprint)) {
                throw new Error(`Fingerprint persistida inválida em ${markerPath}; não foi conectado ao banco.`);
            }
            if (savedFingerprint !== actualFingerprint) {
                throw new Error(
                    `Banco inesperado: fingerprint atual ${actualFingerprint} difere da persistida. ` +
                    'Confirme a base restaurada e configure TIDB_EXPECTED_FINGERPRINT para aprovar uma troca intencional.'
                );
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;

            try {
                fs.writeFileSync(markerPath, `${actualFingerprint}\n`, { flag: 'wx', mode: 0o600 });
            } catch (writeError) {
                if (writeError.code !== 'EEXIST') throw writeError;
                const savedFingerprint = fs.readFileSync(markerPath, 'utf8').trim().toLowerCase();
                if (savedFingerprint !== actualFingerprint) {
                    throw new Error('Outro processo registrou uma fingerprint diferente; conexão cancelada.');
                }
            }
        }
    }

    return actualFingerprint;
}

module.exports = { getDatabaseFingerprint, assertExpectedDatabaseFingerprint };
