import { useEffect, useState } from 'react';
import Library from './components/library';
import BookReader from './components/bookreader';
import type { LibraryBook } from './components/library';
import { Capacitor } from '@capacitor/core';
import { LibraryFolder, nativeBookToFile } from './native/libraryFolder';
import { loadBookInfo } from './utils/loadBook';

export default function App() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);

  const loadLibrary = async () => {
    if (!Capacitor.isNativePlatform()) return;

    const result = await LibraryFolder.listBooks();
    const loadedBooks: LibraryBook[] = [];

    for (const nativeBook of result.books) {
      const file = await nativeBookToFile(nativeBook);
      const info = await loadBookInfo(file);

      loadedBooks.push({
        id: nativeBook.uri,
        file,
        title: info.title,
        coverUrl: info.coverUrl,
      });
    }

    setBooks(loadedBooks);
  };

  const chooseLibraryFolder = async () => {
    if (!Capacitor.isNativePlatform()) return;

    await LibraryFolder.chooseFolder();
    await loadLibrary();
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadLibrary().catch(() => {
        // No folder has been selected yet.
      });
    });
  }, []);

  if (selectedBook) {
    return (
      <BookReader
        book={selectedBook.file}
        onBack={() => setSelectedBook(null)}
      />
    );
  }

  return (
    <Library
      books={books}
      onChooseFolder={chooseLibraryFolder}
      onBookClick={setSelectedBook}
    />
  );
}
