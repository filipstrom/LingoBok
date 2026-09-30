// @ts-expect-error Foliate.js does not provide TypeScript declarations for view.js
import { makeBook as makeBookUntyped } from "../lib/foliate-js/view.js";

const makeBook =
    makeBookUntyped as (
        file: File,
    ) => Promise<unknown>;
type LanguageMap = Record<string, string>;

type FoliateBook = {
    metadata?: {
        title?: string | LanguageMap;
        language?: string | string[];
    };
    getCover?: () => Promise<Blob | null>;
    destroy?: () => void;
};

export type BookInfo = {
    title: string;
    coverUrl?: string;
    language?: string;
};

function getTitle(
    title: string | LanguageMap | undefined,
    fallback: string
): string {
    if (!title) return fallback;
    if (typeof title === "string") return title;

    return title.en ?? title.sv ?? Object.values(title)[0] ?? fallback;
}

export async function loadBookInfo(file: File): Promise<BookInfo> {
    const book = await makeBook(file) as FoliateBook;

    try {
        const fallbackTitle = file.name.replace(/\.epub$/i, "");
        const title = getTitle(book.metadata?.title, fallbackTitle);
        const coverBlob = await book.getCover?.();
        const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : undefined;
        const rawLanguage = book.metadata?.language;
        const language = typeof rawLanguage === "string"
            ? rawLanguage
            : rawLanguage?.[0];

        console.log("BOOK LANGUAGE:", language);

        return { title, coverUrl, language };
    } finally {
        book.destroy?.();
    }
}
