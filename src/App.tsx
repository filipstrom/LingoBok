import { useState } from 'react';
import Library from './components/library';
import BookReader from './components/bookreader';
import type { LibraryBook } from './components/library';
import { loadBookInfo } from './utils/loadBook';

export default function App() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);

  const addBook = async (file: File) => {
    const info = await loadBookInfo(file);
    const book: LibraryBook = {
      id: crypto.randomUUID(),
      file,
      title: info.title,
      coverUrl: info.coverUrl,
    };

    setBooks((currentBooks) => [...currentBooks, book]);
  };

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
      onAddBook={addBook}
      onBookClick={setSelectedBook}
    />
  );
}
