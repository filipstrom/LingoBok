import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeBook = {
    uri: string;
    name: string;
    size: number;
    modified: number;
};

type LibraryFolderPlugin = {
    chooseFolder(): Promise<{ uri: string }>;
    listBooks(): Promise<{ books: NativeBook[] }>;
    materializeBook(options: {
        uri: string;
        name: string;
    }): Promise<{ path: string }>;
};

export const LibraryFolder = registerPlugin<LibraryFolderPlugin>("LibraryFolder");

export async function nativeBookToFile(book: NativeBook): Promise<File> {
    const { path } = await LibraryFolder.materializeBook({
        uri: book.uri,
        name: book.name,
    });
    const response = await fetch(Capacitor.convertFileSrc(path));
    const blob = await response.blob();

    return new File([blob], book.name, {
        type: "application/epub+zip",
    });
}
