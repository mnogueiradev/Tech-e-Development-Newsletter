class EditorialEditionRepository {
  constructor(pool) { this.pool = pool; }

  async create({ editionDate, timezone = 'America/Sao_Paulo', title, intro = null, closing = null, createdBy = null }) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_editions (edition_date, timezone, title, intro, closing, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [editionDate, timezone, title, intro, closing, createdBy]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await this.pool.execute('SELECT * FROM editorial_editions WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async addArticle({ editionId, articleId, position, isFeatured = false }) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_edition_articles (edition_id, article_id, position, is_featured)
       VALUES (?, ?, ?, ?)`,
      [editionId, articleId, position, Boolean(isFeatured)]
    );
    return result.insertId;
  }

  async listArticles(editionId) {
    const [rows] = await this.pool.execute(
      `SELECT ea.*, a.headline, a.subtitle, a.tldr, a.content_json, a.rendered_html, a.editorial_status
       FROM editorial_edition_articles ea
       JOIN editorial_articles a ON a.id = ea.article_id
       WHERE ea.edition_id = ? ORDER BY ea.position ASC`,
      [editionId]
    );
    return rows;
  }
}

module.exports = EditorialEditionRepository;
