const config = require('../../config/selectionConfig');
const EditorialRules = require('./editorialRules');
const SelectionRepository = require('../../repositories/selectionRepository');
const NewsRepository = require('../../repositories/newsRepository');
const { classifyAdvertisement } = require('../adDetector');

class SelectionEngine {
    constructor(pool) {
        this.selectionRepo = new SelectionRepository(pool);
        this.newsRepo = new NewsRepository(pool);
        this.rules = new EditorialRules();
    }

    /**
     * Cria uma edição privada a partir das mesmas candidatas editoriais.
     * Os votos alteram a ordem por fonte, e notícias rejeitadas pelo leitor
     * não voltam a aparecer enquanto ainda estiverem entre as candidatas.
     */
    async runPersonalizedSelection(sourcePreferences = {}, excludedNewsIds = [], categoryFilter = null, candidatePool = null) {
        const candidates = Array.isArray(candidatePool) ? candidatePool : await this.newsRepo.getTopNews(100);
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

        rankedCandidates.sort((a, b) =>
            b.personalizedScore - a.personalizedScore ||
            Number(b.news.score || 0) - Number(a.news.score || 0) ||
            new Date(b.news.publication_date || 0) - new Date(a.news.publication_date || 0) ||
            a.originalPosition - b.originalPosition
        );

        this.rules.reset();
        const finalSelection = [];

        for (const candidate of rankedCandidates) {
            if (finalSelection.length >= config.limits.maxNewsPerEdition) break;

            // Um saldo negativo reduz o teto da fonte de duas notícias para uma.
            const sourceLimit = candidate.affinity < 0
                ? Math.max(1, config.limits.maxPerSource - 1)
                : config.limits.maxPerSource;
            const evaluation = this.rules.evaluate(candidate.news, sourceLimit);
            if (!evaluation.passed) continue;

            candidate.news.selectionReason = evaluation.reason;
            this.rules.registerSelection(candidate.news);
            finalSelection.push(candidate.news);
        }

        return finalSelection;
    }

    /**
     * Roda o algoritmo de curadoria para montar a newsletter do dia
     */
    async runDailySelection(dryRun = false) {
        console.log(`\n[SELECTION_ENGINE] 🎩 Iniciando seleção editorial para a newsletter de hoje.`);
        
        // 1. Busca um pacote amplo de candidatas para compensar anúncios descartados
        // Isso nos dá opções para rejeitar algumas e continuar preenchendo a lista
        const candidates = await this.newsRepo.getTopNews(100);

        if (candidates.length === 0) {
            console.log(`[SELECTION_ENGINE] ⚠️ Nenhuma notícia recente encontrada para seleção.`);
            console.log(`[SELECTION_ENGINE] 💡 Dica: Execute a coleta de notícias (/api/admin/news/collect) para gerar candidatas.`);
            return [];
        }

        console.log(`[SELECTION_ENGINE] 📊 Iniciando avaliação editorial de ${candidates.length} candidatas...`);
        
        this.rules.reset();
        const finalSelection = [];

        console.log(`\n================= AVALIAÇÃO EDITORIAL =================`);

        // 2. Itera pelas candidatas (que já vêm ordenadas pelo maior Score)
        for (const news of candidates) {
            // Se já enchemos a newsletter, para o loop
            if (finalSelection.length >= config.limits.maxNewsPerEdition) {
                console.log(`[SELECTION_ENGINE] ✋ Limite de ${config.limits.maxNewsPerEdition} notícias atingido.`);
                break;
            }

            // Descarta anúncios já armazenados antes de aplicar as regras editoriais.
            const adDecision = classifyAdvertisement(news);
            if (adDecision.isAdvertisement) {
                console.log(`🚫 [ANÚNCIO REJEITADO] ${news.title} — ${adDecision.reasons.join(', ')}`);
                continue;
            }

            // 3. Submete a notícia às regras editoriais (diversidade, repetição, etc)
            const evaluation = this.rules.evaluate(news);

            if (evaluation.passed) {
                console.log(`✅ [SELECIONADA] [Score: ${news.score}] ${news.title}`);
                console.log(`   -> Motivos: ${evaluation.reason}`);
                
                news.selectionReason = evaluation.reason;
                this.rules.registerSelection(news);
                finalSelection.push(news);
            } else {
                console.log(`❌ [REJEITADA]   [Score: ${news.score}] ${news.title}`);
                console.log(`   -> Motivos: ${evaluation.reason}`);
            }
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
