class EditorialArticleRepository {
  constructor(pool) { this.pool = pool; }

  async create({ newsId, headline = null, subtitle = null, tldr = null, contentJson = null, renderedHtml = null, createdBy = null }) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_articles (news_id, headline, subtitle, tldr, content_json, rendered_html, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newsId, headline, subtitle, tldr, contentJson == null ? null : JSON.stringify(contentJson), renderedHtml, createdBy]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await this.pool.execute('SELECT * FROM editorial_articles WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async updateContent({ id, headline, subtitle, tldr, contentJson, renderedHtml }) {
    const [result] = await this.pool.execute(
      `UPDATE editorial_articles
       SET headline = ?, subtitle = ?, tldr = ?, content_json = ?, rendered_html = ?, current_version = current_version + 1
       WHERE id = ?`,
      [headline, subtitle, tldr, contentJson == null ? null : JSON.stringify(contentJson), renderedHtml, id]
    );
    return result.affectedRows;
  }

  async saveVersion({ articleId, version, snapshot, changedBy = null, changeType = 'edit' }) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_article_versions (article_id, version, snapshot_json, changed_by, change_type)
       VALUES (?, ?, ?, ?, ?)`,
      [articleId, version, JSON.stringify(snapshot), changedBy, changeType]
    );
    return result.insertId;
  }

  async listVersions(articleId) {
    const [rows] = await this.pool.execute(
      'SELECT id, article_id, version, snapshot_json, changed_by, change_type, created_at FROM editorial_article_versions WHERE article_id = ? ORDER BY version DESC',
      [articleId]
    );
    return rows;
  }
}

module.exports = EditorialArticleRepository;
