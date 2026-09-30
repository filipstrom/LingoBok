import { lookupWord } from "./dictionary";

export type ExplanationRequest = {
    word: string;
    language?: string;
    sentence?: string;
    paragraph?: string;
};

export type Explanation = {
    word: string;
    text: string;
    source: "dictionary" | "llm";
};

export function getQuickExplanation(
    request: ExplanationRequest
): Explanation | null {
    const translations = lookupWord(
        request.word,
        request.language
    );

    if (!translations) return null;

    return {
        word: request.word,
        text: translations.join(", "),
        source: "dictionary",
    };
}
