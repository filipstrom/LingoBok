import dictionaryEnSv from "../data/dictionary-en-sv";
import dictionaryDeSv from "../data/dictionary-de-sv";

function baseLanguage(language?: string) {
    return language?.toLowerCase().split("-")[0];
}

export function lookupWord(
    word: string,
    language?: string
): string[] | null {
    const normalizedWord = word.toLocaleLowerCase().trim();
    const lang = baseLanguage(language);

    console.log("LOOKUP:", {
        word,
        normalizedWord,
        language,
        lang,
    });

    if (lang === "en") {
        return dictionaryEnSv[normalizedWord] ?? null;
    }

    if (lang === "de") {
        return dictionaryDeSv[normalizedWord] ?? null;
    }

    return null;
}
