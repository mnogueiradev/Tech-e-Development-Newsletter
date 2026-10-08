class SubscriberRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async findByToken(token) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT id, email, timezone, topic, token, subscribed_at FROM subscribers WHERE token = ?',
                [token]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('[SubscriberRepo] Erro ao buscar inscrito por token:', error);
            throw error;
        }
    }

    async findByEmail(email) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT id, email, timezone, topic, token, subscribed_at FROM subscribers WHERE email = ?',
                [email]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('[SubscriberRepo] Erro ao buscar inscrito por e-mail:', error);
            throw error;
        }
    }

    async updateToken(email, token) {
        try {
            await this.pool.execute(
                'UPDATE subscribers SET token = ? WHERE email = ?',
                [token, email]
            );
            return true;
        } catch (error) {
            console.error(`[SubscriberRepo] Erro ao atualizar token (${email}):`, error);
            throw error;
        }
    }

    async create({ email, timezone, topic, token }) {
        try {
            const [result] = await this.pool.execute(
                'INSERT INTO subscribers (email, timezone, topic, token) VALUES (?, ?, ?, ?)',
                [email, timezone || 'America/Sao_Paulo', topic || 'tecnologia', token]
            );
            return result.insertId;
        } catch (error) {
            console.error(`[SubscriberRepo] Erro ao criar inscrito (${email}):`, error);
            throw error;
        }
    }

    async deleteByEmail(email) {
        try {
            await this.pool.execute(
                'DELETE FROM subscribers WHERE email = ?',
                [email]
            );
            return true;
        } catch (error) {
            console.error(`[SubscriberRepo] Erro ao remover inscrito (${email}):`, error);
            throw error;
        }
    }
}

module.exports = SubscriberRepository;
