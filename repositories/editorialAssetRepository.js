class EditorialAssetRepository {
  constructor(pool) { this.pool = pool; }

  async create(asset) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_assets
       (article_id, edition_id, asset_type, public_url, fallback_url, mime_type, original_name,
        file_size_bytes, width_px, height_px, alt_text, caption, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asset.articleId || null, asset.editionId || null, asset.assetType || 'image', asset.publicUrl,
       asset.fallbackUrl || null, asset.mimeType, asset.originalName || null, asset.fileSizeBytes || null,
       asset.widthPx || null, asset.heightPx || null, asset.altText || null, asset.caption || null,
       asset.uploadedBy || null]
    );
    return result.insertId;
  }
}

module.exports = EditorialAssetRepository;
