import { makeBook } from "../lib/foliate-js/view.js";

type LanguageMap = Record<string, string>;

type FoliateBook = {
    metadata?: {
        title?: string | LanguageMap;
    };
    getCover?: () => Promise<Blob | null>;
    destroy?: () => void;
};

function getTitle(
    title: string | LanguageMap | undefined,
    fallback: string
): string {
    if (!title) return fallback;
    if (typeof title === "string") return title;

    return title.en ?? title.sv ?? Object.values(title)[0] ?? fallback;
}

export async function loadBookInfo(file: File) {
    const book = await makeBook(file) as FoliateBook;

    try {
        const fallbackTitle = file.name.replace(/\.epub$/i, "");
        const title = getTitle(book.metadata?.title, fallbackTitle);
        const coverBlob = await book.getCover?.();
        const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : undefined;

        return { title, coverUrl };
    } finally {
        book.destroy?.();
    }
}
