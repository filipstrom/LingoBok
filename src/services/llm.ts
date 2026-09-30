import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const CACHE_VERSION = 4;

const OLLAMA_URL =
    "https://nexus.tail677dd0.ts.net/api/generate";

const MODEL = "gemma3:12b";

/*
 * Prefetch-batcher.
 *
 * Målet är normalt ungefär 2 meningar per request,
 * men upp till 4 korta uppgifter får samsas om det finns plats.
 * Om ett JSON-svar ändå kapas delas batchen automatiskt igen.
 */
const MAX_PREFETCH_WORDS_PER_TASK = 24;
const MAX_PREFETCH_WORDS_PER_REQUEST = 44;
const MAX_PREFETCH_TASKS_PER_REQUEST = 4;
const MAX_PREFETCH_RETRIES = 3;

type OllamaResponse = {
    response: string;
};

type CachedWord = {
    meaning: string;
    baseForm: string;
    explanation: string;
};

type SentenceCacheEntry = {
    source: string;
    translation?: string;
    words: Record<string, CachedWord>;
};

type WordOnlyResponse = CachedWord;

type WordResponse = CachedWord & {
    sentenceTranslation: string;
};

type SentenceResponse = {
    translation: string;
};

type PrefetchWordResponse = {
    word: string;
    meaning: string;
    baseForm: string;
    explanation: string;
};

type PrefetchPageResponse = {
    tasks: Array<{
        id: number;
        sentenceTranslation?: string;
        words: PrefetchWordResponse[];
    }>;
};

type PrefetchTask = {
    id: number;
    sentenceIndex: number;
    sentence: string;
    words: string[];
    translateSentence: boolean;
};

type SentenceCacheUpdate = {
    translation?: string;
    words?: Record<string, CachedWord>;
};

const sentenceMemoryCache =
    new Map<string, SentenceCacheEntry>();

const sentenceCacheLocks =
    new Map<string, Promise<void>>();

function hashString(value: string): string {
    let hash = 5381;

    for (let i = 0; i < value.length; i++) {
        hash =
            ((hash << 5) + hash) ^
            value.charCodeAt(i);
    }

    return (hash >>> 0).toString(36);
}

function normalizeSentence(
    sentence: string,
): string {
    return sentence
        .normalize("NFC")
        .replace(/\s+/gu, " ")
        .trim();
}

function normalizeWord(
    word: string,
): string {
    return word
        .normalize("NFC")
        .trim()
        .toLocaleLowerCase();
}

function normalizeLanguage(
    language: string,
): string {
    return language
        .trim()
        .toLocaleLowerCase();
}

function parseOllamaJson<T>(
    response: string,
    label: string,
): T {
    try {
        return JSON.parse(response) as T;
    } catch (error) {
        console.error(
            `${label}: invalid JSON from Ollama`,
            response,
        );

        throw error;
    }
}

/* -------------------------------------------------------
 * ONE CACHE ENTRY PER SENTENCE
 * ----------------------------------------------------- */

function getSentenceCacheSource(
    sentence: string,
    language: string,
): string {
    return [
        CACHE_VERSION,
        normalizeLanguage(language),
        normalizeSentence(sentence),
    ].join("|");
}

function getSentenceCacheKey(
    sentence: string,
    language: string,
): string {
    return `sentence-cache:${hashString(
        getSentenceCacheSource(
            sentence,
            language,
        ),
    )}`;
}

function emptySentenceCacheEntry(
    sentence: string,
    language: string,
): SentenceCacheEntry {
    return {
        source: getSentenceCacheSource(
            sentence,
            language,
        ),
        words: {},
    };
}

async function getSentenceCacheEntry(
    sentence: string,
    language: string,
): Promise<SentenceCacheEntry> {
    const key = getSentenceCacheKey(
        sentence,
        language,
    );

    const source = getSentenceCacheSource(
        sentence,
        language,
    );

    const memoryEntry =
        sentenceMemoryCache.get(key);

    if (
        memoryEntry &&
        memoryEntry.source === source
    ) {
        return memoryEntry;
    }

    const cached = await Preferences.get({
        key,
    });

    if (!cached.value) {
        const empty =
            emptySentenceCacheEntry(
                sentence,
                language,
            );

        sentenceMemoryCache.set(
            key,
            empty,
        );

        return empty;
    }

    try {
        const entry = JSON.parse(
            cached.value,
        ) as SentenceCacheEntry;

        if (
            entry.source !== source ||
            !entry.words ||
            typeof entry.words !== "object"
        ) {
            throw new Error(
                "Wrong cache version or malformed entry",
            );
        }

        sentenceMemoryCache.set(
            key,
            entry,
        );

        return entry;
    } catch {
        const empty =
            emptySentenceCacheEntry(
                sentence,
                language,
            );

        sentenceMemoryCache.set(
            key,
            empty,
        );

        return empty;
    }
}

async function mergeSentenceCache(
    sentence: string,
    language: string,
    update: SentenceCacheUpdate,
    options: {
        overwriteTranslation?: boolean;
        overwriteWords?: boolean;
    } = {},
): Promise<number> {
    const key = getSentenceCacheKey(
        sentence,
        language,
    );

    const previousLock =
        sentenceCacheLocks.get(key) ??
        Promise.resolve();

    let resolveLock!: () => void;

    const currentLock = new Promise<void>(
        (resolve) => {
            resolveLock = resolve;
        },
    );

    const queuedLock =
        previousLock.then(
            () => currentLock,
        );

    sentenceCacheLocks.set(
        key,
        queuedLock,
    );

    await previousLock;

    try {
        const current =
            await getSentenceCacheEntry(
                sentence,
                language,
            );

        const next: SentenceCacheEntry = {
            source: current.source,
            translation:
                current.translation,
            words: {
                ...current.words,
            },
        };

        if (update.translation) {
            if (
                options.overwriteTranslation ||
                !next.translation
            ) {
                next.translation =
                    update.translation;
            }
        }

        let addedWords = 0;

        if (update.words) {
            for (
                const [wordKey, wordData]
                of Object.entries(
                    update.words,
                )
            ) {
                if (
                    options.overwriteWords ||
                    !next.words[wordKey]
                ) {
                    if (!next.words[wordKey]) {
                        addedWords++;
                    }

                    next.words[wordKey] =
                        wordData;
                }
            }
        }

        sentenceMemoryCache.set(
            key,
            next,
        );

        await Preferences.set({
            key,
            value: JSON.stringify(next),
        });

        return addedWords;
    } finally {
        resolveLock();

        const activeLock =
            sentenceCacheLocks.get(key);

        if (activeLock === queuedLock) {
            sentenceCacheLocks.delete(key);
        }
    }
}

async function getCachedWord(
    word: string,
    sentence: string,
    language: string,
): Promise<CachedWord | null> {
    const entry =
        await getSentenceCacheEntry(
            sentence,
            language,
        );

    return (
        entry.words[
        normalizeWord(word)
        ] ?? null
    );
}


export async function hasCachedExplanation(
    word: string,
    sentence: string,
    language: string,
): Promise<boolean> {
    return (
        (await getCachedWord(
            word,
            sentence,
            language,
        )) !== null
    );
}

/* -------------------------------------------------------
 * MARKDOWN USED BY POPUP
 * ----------------------------------------------------- */

function buildWordMarkdown(
    word: string,
    data: CachedWord,
): string {
    return `
**${word}**

- **Betydelse:** ${data.meaning}
- **Grundform:** ${data.baseForm}
- **Förklaring:** ${data.explanation}
`.trim();
}

function addSentenceTranslation(
    wordResponse: string,
    sentenceTranslation: string | null,
): string {
    if (!sentenceTranslation) {
        return wordResponse;
    }

    return `
${wordResponse}

- **Meningsöversättning:** ${sentenceTranslation}
`.trim();
}

/* -------------------------------------------------------
 * EXPLAIN ONE WORD
 * ----------------------------------------------------- */

export async function explainWord(
    word: string,
    sentence: string,
    language: string,
    force = false,
): Promise<string> {
    const cache =
        await getSentenceCacheEntry(
            sentence,
            language,
        );

    const normalizedWord =
        normalizeWord(word);

    const cachedWord =
        cache.words[normalizedWord] ??
        null;

    const cachedSentence =
        cache.translation ?? null;

    if (cachedWord && !force) {
        console.log(
            "LLM CACHE HIT:",
            word,
        );

        return addSentenceTranslation(
            buildWordMarkdown(
                word,
                cachedWord,
            ),
            cachedSentence,
        );
    }

    /*
     * Meningen finns redan i samma cachepost.
     * Då frågar vi bara efter ordet och genererar
     * inte samma meningsöversättning en gång till.
     */
    if (cachedSentence) {
        const prompt = `
Du hjälper en svensk person att lära sig ${language} genom att läsa en bok.

Målord:
"${word}"

Meningen där ordet förekommer:
"${sentence}"

Analysera exakt vad målordet betyder i just denna mening.

Regler:
- Svara på svenska.
- Ta hänsyn till grammatik, böjning och sammanhang.
- "meaning" ska vara en mycket kort svensk översättning av ordet här.
- "baseForm" ska vara ordets grundform.
- "explanation" ska kort förklara hur ordet används i just denna mening.
`.trim();

        const result =
            await CapacitorHttp.post({
                url: OLLAMA_URL,
                headers: {
                    "Content-Type":
                        "application/json",
                },
                data: {
                    model: MODEL,
                    prompt,
                    stream: false,
                    format: {
                        type: "object",
                        properties: {
                            meaning: {
                                type: "string",
                            },
                            baseForm: {
                                type: "string",
                            },
                            explanation: {
                                type: "string",
                            },
                        },
                        required: [
                            "meaning",
                            "baseForm",
                            "explanation",
                        ],
                    },
                    options: {
                        temperature: 0,
                    },
                },
            });

        const data =
            result.data as OllamaResponse;

        const parsed =
            parseOllamaJson<WordOnlyResponse>(
                data.response,
                "EXPLAIN WORD",
            );

        await mergeSentenceCache(
            sentence,
            language,
            {
                words: {
                    [normalizedWord]: parsed,
                },
            },
            {
                overwriteWords: true,
            },
        );

        console.log(
            "LLM CACHE SAVED:",
            word,
        );

        return addSentenceTranslation(
            buildWordMarkdown(
                word,
                parsed,
            ),
            cachedSentence,
        );
    }

    /*
     * Varken ordet eller meningsöversättningen finns.
     * En enda foreground-request skapar båda och de
     * sparas tillsammans i samma sentence-cachepost.
     */
    const prompt = `
Du hjälper en svensk person att lära sig ${language} genom att läsa en bok.

Målord:
"${word}"

Meningen där ordet förekommer:
"${sentence}"

Analysera exakt vad målordet betyder i just denna mening.

Regler:
- Svara på svenska.
- Ta hänsyn till grammatik, böjning och sammanhang.
- "meaning" ska vara en mycket kort svensk översättning av ordet här.
- "baseForm" ska vara ordets grundform.
- "explanation" ska kort förklara hur ordet används i just denna mening.
- "sentenceTranslation" ska vara en naturlig svensk översättning av hela meningen.
`.trim();

    const result =
        await CapacitorHttp.post({
            url: OLLAMA_URL,
            headers: {
                "Content-Type":
                    "application/json",
            },
            data: {
                model: MODEL,
                prompt,
                stream: false,
                format: {
                    type: "object",
                    properties: {
                        meaning: {
                            type: "string",
                        },
                        baseForm: {
                            type: "string",
                        },
                        explanation: {
                            type: "string",
                        },
                        sentenceTranslation: {
                            type: "string",
                        },
                    },
                    required: [
                        "meaning",
                        "baseForm",
                        "explanation",
                        "sentenceTranslation",
                    ],
                },
                options: {
                    temperature: 0,
                },
            },
        });

    const data =
        result.data as OllamaResponse;

    const parsed =
        parseOllamaJson<WordResponse>(
            data.response,
            "EXPLAIN WORD",
        );

    const wordData: CachedWord = {
        meaning: parsed.meaning,
        baseForm: parsed.baseForm,
        explanation:
            parsed.explanation,
    };

    await mergeSentenceCache(
        sentence,
        language,
        {
            translation:
                parsed.sentenceTranslation,
            words: {
                [normalizedWord]: wordData,
            },
        },
        {
            overwriteTranslation: true,
            overwriteWords: true,
        },
    );

    console.log(
        "LLM CACHE SAVED:",
        word,
    );

    return addSentenceTranslation(
        buildWordMarkdown(
            word,
            wordData,
        ),
        parsed.sentenceTranslation,
    );
}

/* -------------------------------------------------------
 * TRANSLATE ONE SENTENCE
 * ----------------------------------------------------- */

export async function translateSentence(
    sentence: string,
    language: string,
    force = false,
): Promise<string> {
    const cache =
        await getSentenceCacheEntry(
            sentence,
            language,
        );

    if (cache.translation && !force) {
        console.log(
            "SENTENCE CACHE HIT",
        );

        return cache.translation;
    }

    const prompt = `
Översätt följande mening från ${language} till naturlig svenska.

Mening:
"${sentence}"

Översätt bara meningen.
Förklara ingenting.
`.trim();

    const result =
        await CapacitorHttp.post({
            url: OLLAMA_URL,
            headers: {
                "Content-Type":
                    "application/json",
            },
            data: {
                model: MODEL,
                prompt,
                stream: false,
                format: {
                    type: "object",
                    properties: {
                        translation: {
                            type: "string",
                        },
                    },
                    required: [
                        "translation",
                    ],
                },
                options: {
                    temperature: 0,
                },
            },
        });

    const data =
        result.data as OllamaResponse;

    const parsed =
        parseOllamaJson<SentenceResponse>(
            data.response,
            "TRANSLATE SENTENCE",
        );

    await mergeSentenceCache(
        sentence,
        language,
        {
            translation:
                parsed.translation,
        },
        {
            overwriteTranslation: true,
        },
    );

    return parsed.translation;
}

/* -------------------------------------------------------
 * PAGE PREFETCH
 * ----------------------------------------------------- */

function splitIntoChunks<T>(
    values: T[],
    chunkSize: number,
): T[][] {
    const chunks: T[][] = [];

    for (
        let i = 0;
        i < values.length;
        i += chunkSize
    ) {
        chunks.push(
            values.slice(
                i,
                i + chunkSize,
            ),
        );
    }

    return chunks;
}

function buildPrefetchBatches(
    tasks: PrefetchTask[],
): PrefetchTask[][] {
    const expandedTasks:
        PrefetchTask[] = [];

    let nextId = 0;

    for (const task of tasks) {
        const wordChunks =
            task.words.length > 0
                ? splitIntoChunks(
                    task.words,
                    MAX_PREFETCH_WORDS_PER_TASK,
                )
                : [[]];

        for (
            let i = 0;
            i < wordChunks.length;
            i++
        ) {
            expandedTasks.push({
                ...task,
                id: nextId++,
                words: wordChunks[i],
                translateSentence:
                    task.translateSentence &&
                    i === 0,
            });
        }
    }

    const batches:
        PrefetchTask[][] = [];

    let currentBatch:
        PrefetchTask[] = [];

    let currentWordCount = 0;

    for (const task of expandedTasks) {
        const taskWordCount =
            task.words.length;

        const batchWouldBeTooLarge =
            currentBatch.length > 0 &&
            (
                currentBatch.length >=
                MAX_PREFETCH_TASKS_PER_REQUEST ||
                currentWordCount +
                taskWordCount >
                MAX_PREFETCH_WORDS_PER_REQUEST
            );

        if (batchWouldBeTooLarge) {
            batches.push(currentBatch);
            currentBatch = [];
            currentWordCount = 0;
        }

        currentBatch.push(task);
        currentWordCount +=
            taskWordCount;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

function buildPrefetchPrompt(
    tasks: PrefetchTask[],
    language: string,
): string {
    return `
Du hjälper en svensk person att lära sig ${language} genom att läsa en bok.

Du får flera uppgifter. Returnera exakt en JSON-post för varje uppgift och behåll samma "id".

${tasks
            .map((task) => {
                const translationInstruction =
                    task.translateSentence
                        ? "Ja. Returnera sentenceTranslation."
                        : "Nej. Utelämna sentenceTranslation.";

                return `
Uppgift ${task.id}:
Mening:
"${task.sentence}"

Översätt meningen:
${translationInstruction}

Ord som MÅSTE förklaras:
${task.words.length > 0
                        ? task.words.join(", ")
                        : "Inga ord."}
`.trim();
            })
            .join("\n\n")}

Regler:
- Svara på svenska.
- Returnera exakt de ord som står i varje uppgifts ordlista, inga färre och inga extra.
- "meaning" ska vara en mycket kort svensk översättning av ordet i just den meningen.
- "baseForm" ska vara ordets grundform.
- "explanation" ska vara en kort förklaring av ordets användning i just den meningen.
- Ändra inte ett ords stavning i fältet "word".
- Om en uppgift säger att meningen inte ska översättas ska sentenceTranslation utelämnas för den uppgiften.
`.trim();
}

const PREFETCH_FORMAT = {
    type: "object",
    properties: {
        tasks: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                    },
                    sentenceTranslation: {
                        type: "string",
                    },
                    words: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                word: {
                                    type: "string",
                                },
                                meaning: {
                                    type: "string",
                                },
                                baseForm: {
                                    type: "string",
                                },
                                explanation: {
                                    type: "string",
                                },
                            },
                            required: [
                                "word",
                                "meaning",
                                "baseForm",
                                "explanation",
                            ],
                        },
                    },
                },
                required: [
                    "id",
                    "words",
                ],
            },
        },
    },
    required: [
        "tasks",
    ],
} as const;

async function runPrefetchBatch(
    tasks: PrefetchTask[],
    language: string,
    shouldContinue: () => boolean,
    retryDepth = 0,
): Promise<number> {
    if (tasks.length === 0) {
        return 0;
    }

    const prompt =
        buildPrefetchPrompt(
            tasks,
            language,
        );

    let parsed: PrefetchPageResponse;

    try {
        const result =
            await CapacitorHttp.post({
                url: OLLAMA_URL,
                headers: {
                    "Content-Type":
                        "application/json",
                },
                data: {
                    model: MODEL,
                    prompt,
                    stream: false,
                    format:
                        PREFETCH_FORMAT,
                    options: {
                        temperature: 0,
                    },
                },
            });

        const data =
            result.data as OllamaResponse;

        parsed =
            parseOllamaJson<PrefetchPageResponse>(
                data.response,
                "PREFETCH",
            );
    } catch (error) {
        /*
         * Om användaren redan har bytt sida ska vi inte
         * lägga tid på att göra om en kapad gammal batch.
         */
        if (!shouldContinue()) {
            console.log(
                "PREFETCH PAGE: cancelled after failed batch",
            );

            return 0;
        }

        /*
         * Ett långt structured-output-svar kan kapas.
         * Dela då automatiskt upp requesten i mindre bitar.
         */
        if (
            retryDepth <
            MAX_PREFETCH_RETRIES &&
            tasks.length > 1
        ) {
            const middle =
                Math.ceil(
                    tasks.length / 2,
                );

            const first =
                await runPrefetchBatch(
                    tasks.slice(
                        0,
                        middle,
                    ),
                    language,
                    shouldContinue,
                    retryDepth + 1,
                );

            if (!shouldContinue()) {
                return first;
            }

            const second =
                await runPrefetchBatch(
                    tasks.slice(middle),
                    language,
                    shouldContinue,
                    retryDepth + 1,
                );

            return first + second;
        }

        if (
            retryDepth <
            MAX_PREFETCH_RETRIES &&
            tasks.length === 1 &&
            tasks[0].words.length > 1
        ) {
            const task = tasks[0];

            const middle =
                Math.ceil(
                    task.words.length / 2,
                );

            const firstTask:
                PrefetchTask = {
                ...task,
                id:
                    task.id * 10 + 1,
                words:
                    task.words.slice(
                        0,
                        middle,
                    ),
            };

            const secondTask:
                PrefetchTask = {
                ...task,
                id:
                    task.id * 10 + 2,
                words:
                    task.words.slice(
                        middle,
                    ),
                translateSentence: false,
            };

            const first =
                await runPrefetchBatch(
                    [firstTask],
                    language,
                    shouldContinue,
                    retryDepth + 1,
                );

            if (!shouldContinue()) {
                return first;
            }

            const second =
                await runPrefetchBatch(
                    [secondTask],
                    language,
                    shouldContinue,
                    retryDepth + 1,
                );

            return first + second;
        }

        throw error;
    }

    const taskById = new Map(
        tasks.map(
            (task) => [
                task.id,
                task,
            ] as const,
        ),
    );

    /*
     * Samla allt från samma mening först.
     * Sedan blir det EN Preferences.set per mening,
     * inte en set per ord.
     */
    const updatesBySentence = new Map<
        number,
        {
            sentence: string;
            translation?: string;
            words: Record<string, CachedWord>;
        }
    >();

    const retryTasks:
        PrefetchTask[] = [];

    for (
        const resultTask
        of parsed.tasks
    ) {
        const task =
            taskById.get(
                resultTask.id,
            );

        if (!task) {
            continue;
        }

        let sentenceUpdate =
            updatesBySentence.get(
                task.sentenceIndex,
            );

        if (!sentenceUpdate) {
            sentenceUpdate = {
                sentence:
                    task.sentence,
                words: {},
            };

            updatesBySentence.set(
                task.sentenceIndex,
                sentenceUpdate,
            );
        }

        if (
            task.translateSentence &&
            resultTask.sentenceTranslation
        ) {
            sentenceUpdate.translation =
                resultTask.sentenceTranslation;
        }

        const returnedWords = new Map(
            resultTask.words.map(
                (word) => [
                    normalizeWord(
                        word.word,
                    ),
                    word,
                ] as const,
            ),
        );

        const missingWords:
            string[] = [];

        for (
            const requestedWord
            of task.words
        ) {
            const returnedWord =
                returnedWords.get(
                    normalizeWord(
                        requestedWord,
                    ),
                );

            if (!returnedWord) {
                missingWords.push(
                    requestedWord,
                );

                continue;
            }

            sentenceUpdate.words[
                normalizeWord(
                    requestedWord,
                )
            ] = {
                meaning:
                    returnedWord.meaning,
                baseForm:
                    returnedWord.baseForm,
                explanation:
                    returnedWord.explanation,
            };
        }

        if (
            missingWords.length > 0 &&
            retryDepth <
            MAX_PREFETCH_RETRIES &&
            shouldContinue()
        ) {
            retryTasks.push({
                ...task,
                id:
                    task.id * 100 +
                    retryDepth + 1,
                words: missingWords,
                translateSentence: false,
            });
        }
    }

    /*
     * Om modellen hoppade över en hel uppgift försöker vi
     * bara om den om sidan fortfarande är aktuell.
     */
    if (shouldContinue()) {
        for (const task of tasks) {
            const wasReturned =
                parsed.tasks.some(
                    (resultTask) =>
                        resultTask.id ===
                        task.id,
                );

            if (
                !wasReturned &&
                retryDepth <
                MAX_PREFETCH_RETRIES
            ) {
                retryTasks.push({
                    ...task,
                    id:
                        task.id * 1000 +
                        retryDepth + 1,
                });
            }
        }
    }

    let savedWords = 0;

    /*
     * Resultatet från batchen sparas ALLTID,
     * även om användaren hann byta sida medan den körde.
     * Background-data skriver däremot inte över ett
     * foreground-resultat som redan finns.
     */
    for (
        const update
        of updatesBySentence.values()
    ) {
        savedWords +=
            await mergeSentenceCache(
                update.sentence,
                language,
                {
                    translation:
                        update.translation,
                    words: update.words,
                },
                {
                    overwriteTranslation: false,
                    overwriteWords: false,
                },
            );
    }

    if (
        retryTasks.length > 0 &&
        shouldContinue()
    ) {
        savedWords +=
            await runPrefetchBatch(
                retryTasks,
                language,
                shouldContinue,
                retryDepth + 1,
            );
    }

    return savedWords;
}

export async function prefetchPage(
    sentences: string[],
    language: string,
    shouldContinue:
        () => boolean = () => true,
): Promise<number> {
    if (sentences.length === 0) {
        return 0;
    }

    const uniqueSentences = [
        ...new Map(
            sentences.map(
                (sentence) => [
                    normalizeSentence(
                        sentence,
                    ),
                    sentence,
                ] as const,
            ),
        ).values(),
    ];

    const pendingTasks:
        PrefetchTask[] = [];

    /*
     * En enda cache-read per mening.
     * Vi gör INTE längre en Preferences.get per ord.
     */
    const sentenceStates =
        await Promise.all(
            uniqueSentences.map(
                async (
                    sentence,
                    sentenceIndex,
                ) => {
                    const cache =
                        await getSentenceCacheEntry(
                            sentence,
                            language,
                        );

                    return {
                        sentence,
                        sentenceIndex,
                        cache,
                    };
                },
            ),
        );

    for (const state of sentenceStates) {
        const words = [
            ...new Map(
                (
                    state.sentence.match(
                        /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu,
                    ) ?? []
                ).map(
                    (word) => [
                        normalizeWord(word),
                        word,
                    ] as const,
                ),
            ).values(),
        ];

        const missingWords =
            words.filter(
                (word) =>
                    !state.cache.words[
                    normalizeWord(word)
                    ],
            );

        const needsTranslation =
            !state.cache.translation;

        if (
            !needsTranslation &&
            missingWords.length === 0
        ) {
            continue;
        }

        pendingTasks.push({
            id: state.sentenceIndex,
            sentenceIndex:
                state.sentenceIndex,
            sentence: state.sentence,
            words: missingWords,
            translateSentence:
                needsTranslation,
        });
    }

    if (pendingTasks.length === 0) {
        console.log(
            "PREFETCH PAGE: already cached",
        );

        return 0;
    }

    const batches =
        buildPrefetchBatches(
            pendingTasks,
        );

    let savedWords = 0;

    for (
        let i = 0;
        i < batches.length;
        i++
    ) {
        if (!shouldContinue()) {
            console.log(
                "PREFETCH PAGE: cancelled",
            );

            break;
        }

        console.log(
            `PREFETCH PAGE: batch ${i + 1}/${batches.length}`,
        );

        savedWords +=
            await runPrefetchBatch(
                batches[i],
                language,
                shouldContinue,
            );
    }

    console.log(
        `PREFETCH PAGE: done, cached ${savedWords} new words`,
    );

    return savedWords;
}
