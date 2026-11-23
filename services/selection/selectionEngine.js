const config = require('../../config/selectionConfig');
const EditorialRules = require('./editorialRules');
const SelectionRepository = require('../../repositories/selectionRepository');
const NewsRepository = require('../../repositories/newsRepository');
const NewsletterHistoryRepository = require('../../repositories/newsletterHistoryRepository');
const { classifyAdvertisement } = require('../adDetector');
const { isLegacyNews } = require('../editorial/legacyNewsPolicy');
const { isTechnologyNews } = require('../technologyNewsFilter');

class SelectionEngine {
    constructor(pool) {
        this.selectionRepo = new SelectionRepository(pool);
        this.newsRepo = new NewsRepository(pool);
        this.newsletterHistoryRepo = new NewsletterHistoryRepository(pool);
        this.rules = new EditorialRules();
    }

    /**
     * Cria uma edição privada a partir das mesmas candidatas editoriais.
     * Os votos alteram a ordem por fonte, e notícias rejeitadas pelo leitor
     * não voltam a aparecer enquanto ainda estiverem entre as candidatas.
     */
    async runPersonalizedSelection(sourcePreferences = {}, excludedNewsIds = [], categoryFilter = null, candidatePool = null) {
        const candidates = (Array.isArray(candidatePool) ? candidatePool : await this.newsRepo.getTopNews(200))
            .filter(news => isLegacyNews(news) && isTechnologyNews(news));
        const excludedIds = new Set((excludedNewsIds || []).map(Number));
        const normalizedCategory = String(categoryFilter || '').trim().toLowerCase();
        const rankedCandidates = [];

        candidates.forEach((news, originalPosition) => {
            if (!news || excludedIds.has(Number(news.id))) return;
            if (classifyAdvertisement(news).isAdvertisement) return;
            if (normalizedCategory && !String(news.category || '').toLowerCase().includes(normalizedCategory)) return;

            const sourcePreference = sourcePreferences[String(news.source_id)] || {};
            const weightedUp = Number(sourcePreference.weightedUp || 0);
            const weightedDown = Number(sourcePreference.weightedDown || 0);
            const affinity = (weightedUp - weightedDown) / (1 + weightedUp + weightedDown);
            const score = Number(news.score || 0);
            const personalizedScore = score * (1 + affinity * 0.8);

            rankedCandidates.push({
                news: { ...news },
                originalPosition,
                affinity,
                personalizedScore
            });
        });

        return this.selectCandidatesForEdition(rankedCandidates.map(candidate => ({
            news: candidate.news,
            score: candidate.personalizedScore,
            originalPosition: candidate.originalPosition,
            // Um saldo negativo reduz o teto da fonte de duas notícias para uma.
            sourceLimit: candidate.affinity < 0
                ? Math.max(1, config.limits.maxPerSource - 1)
                : config.limits.maxPerSource
        })));
    }

    selectCandidatesForEdition(rankedCandidates, { seedItems = [], targetCount = config.limits.maxNewsPerEdition } = {}) {
        const selection = this.selectDiversifiedCandidates(rankedCandidates, null, { seedItems, targetCount });
        if (seedItems.length > 0 || selection.length >= targetCount || selection.length > config.limits.smallEditionThreshold) return selection;

        // Em edições curtas, limite cada organização a uma única notícia.
        return this.selectDiversifiedCandidates(
            rankedCandidates,
            config.limits.smallEditionMaxPerOrganization,
            { seedItems, targetCount }
        );
    }

    selectDiversifiedCandidates(rankedCandidates, maxPerOrganizationOverride = null, { seedItems = [], targetCount = config.limits.maxNewsPerEdition } = {}) {
        this.rules.reset(maxPerOrganizationOverride);
        const remaining = [...rankedCandidates];
        const finalSelection = [...seedItems];
        const selectedIds = new Set(seedItems.map(item => Number(item.id || item.news_id)).filter(Number.isFinite));
        seedItems.forEach(item => this.rules.registerSelection(item));

        while (remaining.length > 0 && finalSelection.length < targetCount) {
            let bestIndex = -1;
            let bestEvaluation = null;
            let bestAdjustedScore = -Infinity;
            let bestBaseScore = -Infinity;
            let bestPosition = Infinity;

            for (let index = 0; index < remaining.length; index++) {
                const candidate = remaining[index];
                const evaluation = this.rules.evaluate(candidate.news, candidate.sourceLimit);
                if (!evaluation.passed) continue;

                const baseScore = Number(candidate.score || 0);
                const adjustedScore = this.rules.getDiversityAdjustedScore(candidate.news, baseScore);
                const originalPosition = Number(candidate.originalPosition || 0);
                const isBetter = adjustedScore > bestAdjustedScore ||
                    (adjustedScore === bestAdjustedScore && baseScore > bestBaseScore) ||
                    (adjustedScore === bestAdjustedScore && baseScore === bestBaseScore && originalPosition < bestPosition);

                if (isBetter) {
                    bestIndex = index;
                    bestEvaluation = evaluation;
                    bestAdjustedScore = adjustedScore;
                    bestBaseScore = baseScore;
                    bestPosition = originalPosition;
                }
            }

            if (bestIndex < 0) break;

            const [bestCandidate] = remaining.splice(bestIndex, 1);
            const candidateId = Number(bestCandidate.news?.id || bestCandidate.news?.news_id);
            if (Number.isFinite(candidateId) && selectedIds.has(candidateId)) continue;
            bestCandidate.news.selectionReason = bestEvaluation.reason;
            this.rules.registerSelection(bestCandidate.news);
            finalSelection.push(bestCandidate.news);
            if (Number.isFinite(candidateId)) selectedIds.add(candidateId);
        }

        return finalSelection;
    }

    /**
     * Completa uma edição filtrando primeiro o que já estava salvo e buscando
     * candidatas tecnológicas válidas para repor as posições removidas.
     */
    async completeDailySelection(existingItems = [], {
        excludedNewsIds = [],
        categoryFilter = null,
        targetCount = config.limits.maxNewsPerEdition
    } = {}) {
        const requestedCount = Math.max(0, Math.min(
            config.limits.maxNewsPerEdition,
            Math.floor(Number(targetCount) || 0)
        ));
        const excludedIds = new Set((excludedNewsIds || []).map(Number).filter(Number.isFinite));
        const normalizedCategory = String(categoryFilter || '').trim().toLowerCase();
        const stats = {
            excludedByTechnology: 0,
            excludedByLegacyOrigin: 0,
            excludedByAdvertisement: 0,
            excludedByHistory: 0,
            excludedByCategory: 0,
            excludedAsDuplicate: 0,
            candidateCount: 0,
            replacements: 0,
            diversityFallbackItems: 0
        };
        const validItems = [];
        const selectedIds = new Set();

        for (const item of existingItems || []) {
            const id = Number(item?.id || item?.news_id);
            if (item && !isLegacyNews(item)) {
                stats.excludedByLegacyOrigin++;
                continue;
            }
            if (!item || !isTechnologyNews(item)) {
                stats.excludedByTechnology++;
                continue;
            }
            if (classifyAdvertisement(item).isAdvertisement) {
                stats.excludedByAdvertisement++;
                continue;
            }
            if (Number.isFinite(id) && excludedIds.has(id)) {
                stats.excludedByHistory++;
                continue;
            }
            if (normalizedCategory && !String(item.category || '').toLowerCase().includes(normalizedCategory)) {
                stats.excludedByCategory++;
                continue;
            }
            if (Number.isFinite(id) && selectedIds.has(id)) {
                stats.excludedAsDuplicate++;
                continue;
            }

            validItems.push(item);
            if (Number.isFinite(id)) selectedIds.add(id);
            if (validItems.length >= requestedCount) break;
        }

        if (validItems.length >= requestedCount) {
            return { items: validItems.slice(0, requestedCount), stats };
        }

        const excludedCandidateIds = new Set([...excludedIds, ...selectedIds]);
        const candidateLimit = 2000;
        const candidates = await this.newsRepo.getTopNews(candidateLimit, [...excludedCandidateIds]);
        const rankedCandidates = [];

        (candidates || []).forEach((news, originalPosition) => {
            const id = Number(news?.id || news?.news_id);
            if (!news || !isLegacyNews(news)) {
                stats.excludedByLegacyOrigin++;
                return;
            }
            if (!isTechnologyNews(news)) {
                stats.excludedByTechnology++;
                return;
            }
            if (classifyAdvertisement(news).isAdvertisement) {
                stats.excludedByAdvertisement++;
                return;
            }
            if (Number.isFinite(id) && excludedCandidateIds.has(id)) return;
            if (normalizedCategory && !String(news.category || '').toLowerCase().includes(normalizedCategory)) {
                stats.excludedByCategory++;
                return;
            }

            rankedCandidates.push({ news: { ...news }, score: Number(news.score || 0), originalPosition });
        });
        stats.candidateCount = rankedCandidates.length;

        const items = this.selectCandidatesForEdition(rankedCandidates, {
            seedItems: validItems,
            targetCount: requestedCount
        });

        // Se as regras de diversidade deixarem lacunas apesar de haver artigos
        // elegíveis, completa as posições relaxando apenas esses limites. Os
        // filtros de tecnologia, origem, anúncios, categoria e histórico seguem ativos.
        if (items.length < requestedCount) {
            const completedIds = new Set(items.map(item => Number(item.id || item.news_id)).filter(Number.isFinite));
            for (const candidate of rankedCandidates) {
                if (items.length >= requestedCount) break;
                const id = Number(candidate.news?.id || candidate.news?.news_id);
                if (Number.isFinite(id) && completedIds.has(id)) continue;
                items.push({
                    ...candidate.news,
                    selectionReason: 'Complemento tecnológico após aplicação dos filtros de conteúdo.'
                });
                if (Number.isFinite(id)) completedIds.add(id);
                stats.diversityFallbackItems++;
            }
        }

        items.splice(requestedCount);
        stats.replacements = Math.max(0, items.length - validItems.length);
        return { items, stats };
    }

    /**
     * Roda o algoritmo de curadoria para montar a newsletter do dia
     */
    async runDailySelection(dryRun = false) {
        console.log(`\n[SELECTION_ENGINE] 🎩 Iniciando seleção editorial para a newsletter de hoje.`);
        
        // 1. Busca um pacote amplo de candidatas para compensar anúncios descartados
        // Isso nos dá opções para rejeitar algumas e continuar preenchendo a lista
        const previousEditionNewsIds = await this.newsletterHistoryRepo.getPreviousEditionNewsIds();
        const candidates = (await this.newsRepo.getTopNews(200, [...previousEditionNewsIds]))
            .filter(news => isLegacyNews(news) && isTechnologyNews(news));

        if (previousEditionNewsIds.size > 0) {
            console.log(`[SELECTION_ENGINE] 🚫 Excluindo ${previousEditionNewsIds.size} notícias da edição anterior.`);
        }

        if (candidates.length === 0) {
            console.log(`[SELECTION_ENGINE] ⚠️ Nenhuma notícia recente encontrada para seleção.`);
            console.log(`[SELECTION_ENGINE] 💡 Dica: Execute a coleta de notícias (/api/admin/news/collect) para gerar candidatas.`);
            return [];
        }

        console.log(`[SELECTION_ENGINE] 📊 Iniciando avaliação editorial de ${candidates.length} candidatas...`);
        
        console.log(`\n================= AVALIAÇÃO EDITORIAL =================`);

        // 2. Remove anúncios e escolhe o próximo maior score ajustado pela
        // variedade já presente na edição.
        const editorialCandidates = candidates.filter(news => {
            const adDecision = classifyAdvertisement(news);
            if (!adDecision.isAdvertisement) return true;

            console.log(`🚫 [ANÚNCIO REJEITADO] ${news.title} — ${adDecision.reasons.join(', ')}`);
            return false;
        }).map((news, originalPosition) => ({
            news,
            score: Number(news.score || 0),
            originalPosition
        }));
        const finalSelection = this.selectCandidatesForEdition(editorialCandidates);

        finalSelection.forEach(news => {
            console.log(`✅ [SELECIONADA] [Score: ${news.score}] ${news.title}`);
            console.log(`   -> Motivos: ${news.selectionReason}`);
        });

        if (finalSelection.length >= config.limits.maxNewsPerEdition) {
            console.log(`[SELECTION_ENGINE] ✋ Limite de ${config.limits.maxNewsPerEdition} notícias atingido.`);
        }

        console.log(`=======================================================\n`);

        if (finalSelection.length > 0) {
            // 4. Salva a seleção no banco apenas se não for dryRun
            if (!dryRun) {
                await this.selectionRepo.saveSelections(finalSelection, config.version);
                console.log(`[SELECTION_ENGINE] 🏆 Seleção salva no banco: ${finalSelection.length} notícias escolhidas.`);
            } else {
                console.log(`[SELECTION_ENGINE] 🧪 Dry-run concluído: ${finalSelection.length} notícias recomendadas.`);
            }
        } else {
            console.warn(`[SELECTION_ENGINE] ⚠️ Nenhuma notícia atendeu aos critérios editoriais hoje.`);
        }

        return finalSelection;
    }
}

module.exports = SelectionEngine;
