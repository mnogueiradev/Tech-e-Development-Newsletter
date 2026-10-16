const config = require('../../config/selectionConfig');
const SimilarityGrouper = require('./similarityGrouper');
const { getPrimaryOrganization } = require('./organizationDetector');
const { classifyArticle } = require('../categoryClassifier');

const CATEGORY_ALIASES = {
    ia: ['ia', 'ai', 'artificial intelligence', 'machine learning', 'inteligencia artificial', 'inteligência artificial'],
    ciberseguranca: ['ciberseguranca', 'cibersegurança', 'security', 'cybersecurity', 'infosec'],
    desenvolvimento: ['desenvolvimento', 'development', 'web', 'programming', 'software engineering', 'frontend', 'backend'],
    cloud: ['cloud', 'aws', 'gcp', 'azure', 'nuvem'],
    startups: ['startups', 'startup', 'business', 'negócios', 'mercado', 'saas', 'funding'],
    hardware: ['hardware', 'chips', 'gpu', 'cpu', 'devices', 'semicondutores'],
    mobile: ['mobile', 'android', 'ios', 'smartphone', 'apps'],
    devops: ['devops', 'sre', 'ci/cd', 'infraestrutura', 'observabilidade']
};

function normalizeCategory(category) {
    const normalized = String(category || '').trim().toLowerCase();
    if (!normalized) return null;

    for (const [canonicalCategory, aliases] of Object.entries(CATEGORY_ALIASES)) {
        if (aliases.includes(normalized)) return canonicalCategory;
    }

    return normalized;
}

function getCategoryKey(news = {}) {
    const category = normalizeCategory(news.category);
    if (category && !['geral', 'tecnologia', 'technology', 'general', 'tech'].includes(category)) {
        return category;
    }

    return normalizeCategory(classifyArticle(news.title || '', news.description || '', [], 'desenvolvimento'));
}

class EditorialRules {
    constructor() {
        this.selectedSourcesCount = {};
        this.selectedNews = [];
    }

    /**
     * Reseta as contagens de controle para uma nova edição
     */
    reset(maxPerOrganizationOverride = null) {
        this.selectedSourcesCount = {};
        this.selectedCategoriesCount = {};
        this.selectedOrganizationsCount = {};
        this.selectedNews = [];
        this.maxPerOrganizationOverride = Number.isInteger(maxPerOrganizationOverride) && maxPerOrganizationOverride > 0
            ? maxPerOrganizationOverride
            : null;
    }

    /**
     * Verifica se a notícia passa pelas regras editoriais da edição
     * Retorna { passed: boolean, reason: string }
     */
    evaluate(news, sourceLimit = config.limits.maxPerSource) {
        // Regra 1: Diversidade de Fontes (Max por fonte)
        const sourceName = news.source_name || 'Desconhecido';
        const sourceCount = this.selectedSourcesCount[sourceName] || 0;
        const maxPerSource = Number.isInteger(sourceLimit) && sourceLimit > 0
            ? sourceLimit
            : config.limits.maxPerSource;

        if (sourceCount >= maxPerSource) {
            return {
                passed: false,
                reason: `Rejeitada: Limite da fonte atingido (${maxPerSource} notícias de ${sourceName})`
            };
        }

        // Evita que uma única empresa ou produto domine a edição.
        const organization = getPrimaryOrganization(news);
        const organizationCount = organization
            ? (this.selectedOrganizationsCount[organization] || 0)
            : 0;
        const maxPerOrganization = this.getMaxPerOrganization();

        if (organization && organizationCount >= maxPerOrganization) {
            return {
                passed: false,
                reason: `Rejeitada: limite de ${maxPerOrganization} notícias da organização ${organization} atingido`
            };
        }

        // Regra 2: Diversidade Temática (Repetição)
        let similarTo = null;
        for (const selected of this.selectedNews) {
            if (SimilarityGrouper.isSimilar(news, selected)) {
                similarTo = selected;
                break;
            }
        }

        if (similarTo) {
            return {
                passed: false,
                reason: `Rejeitada: Tema repetido. Já escolhemos uma notícia muito similar ('${similarTo.title}')`
            };
        }

        // Se passou em tudo, é aceita.
        return {
            passed: true,
            reason: `Aceita: contribui para a diversidade (categoria: ${getCategoryKey(news) || 'não identificada'}, organização: ${organization || 'não identificada'}, fonte: ${sourceName})`
        };
    }

    getMaxPerOrganization() {
        if (this.maxPerOrganizationOverride) return this.maxPerOrganizationOverride;

        const editionSize = config.limits.maxNewsPerEdition;
        if (editionSize <= config.limits.smallEditionThreshold) {
            return config.limits.smallEditionMaxPerOrganization;
        }

        return Math.max(1, Math.round(editionSize * config.limits.maxOrganizationShare));
    }

    getDiversityAdjustedScore(news, score) {
        const category = getCategoryKey(news);
        const categoryCount = category ? (this.selectedCategoriesCount[category] || 0) : 0;
        const organization = getPrimaryOrganization(news);
        const organizationCount = organization
            ? (this.selectedOrganizationsCount[organization] || 0)
            : 0;
        const categoryPenalty = Math.min(
            config.limits.maxCategoryDiversityPenalty,
            categoryCount * config.weights.repeatedCategoryPenalty
        );
        const organizationPenalty = Math.min(
            config.limits.maxOrganizationDiversityPenalty,
            organizationCount * config.weights.repeatedOrganizationPenalty
        );

        const numericScore = Number(score || 0);
        const totalPenalty = categoryPenalty + organizationPenalty;
        return numericScore >= 0
            ? numericScore * (1 - totalPenalty)
            : numericScore * (1 + totalPenalty);
    }

    /**
     * Registra que a notícia foi escolhida, atualizando os contadores internos
     */
    registerSelection(news) {
        const sourceName = news.source_name || 'Desconhecido';
        const category = getCategoryKey(news);
        const organization = getPrimaryOrganization(news);

        this.selectedSourcesCount[sourceName] = (this.selectedSourcesCount[sourceName] || 0) + 1;
        if (category) {
            this.selectedCategoriesCount[category] = (this.selectedCategoriesCount[category] || 0) + 1;
        }
        if (organization) {
            this.selectedOrganizationsCount[organization] = (this.selectedOrganizationsCount[organization] || 0) + 1;
        }
        this.selectedNews.push(news);
    }
}

module.exports = EditorialRules;
