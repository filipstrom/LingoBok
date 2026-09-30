import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import Library from './components/library';
import BookReader from './components/BookReader';
import type { LibraryBook } from './components/library';
import { Capacitor } from '@capacitor/core';
import { LibraryFolder, nativeBookToFile } from './native/libraryFolder';
import { loadBookInfo } from './utils/loadBook';

export default function App() {
  const isNative = Capacitor.isNativePlatform();
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
        language: info.language,
      });
    }

    setBooks(loadedBooks);
  };

  const chooseLibraryFolder = async () => {
    await LibraryFolder.chooseFolder();
    await loadLibrary();
  };

  const addWebBook = async (file: File) => {
    const info = await loadBookInfo(file);
    setBooks((currentBooks) => [
      ...currentBooks,
      {
        id: file.name,
        file,
        title: info.title,
        coverUrl: info.coverUrl,
        language: info.language,
      },
    ]);
  };

  useEffect(() => {
    if (!isNative) return;

    queueMicrotask(() => {
      void loadLibrary().catch(() => {
        // No folder has been selected yet.
      });
    });
  }, [isNative]);

  useEffect(() => {
    const listener = CapacitorApp.addListener('backButton', () => {
      if (selectedBook) {
        setSelectedBook(null);
      } else {
        void CapacitorApp.minimizeApp();
      }
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [selectedBook]);

  if (selectedBook) {
    return (
      <BookReader
        key={selectedBook.id}
        book={selectedBook.file}
        bookId={selectedBook.id}
        language={selectedBook.language}
      />
    );
  }

  return (
    <Library
      books={books}
      isNative={isNative}
      onChooseFolder={chooseLibraryFolder}
      onAddBook={addWebBook}
      onBookClick={setSelectedBook}
    />
  );
}
