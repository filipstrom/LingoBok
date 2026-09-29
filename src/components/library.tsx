import BookCover from "./bookcover";
import "./Library.css";

export type LibraryBook = {
    id: string;
    file: File;
    title: string;
    coverUrl?: string;
};

type LibraryProps = {
    books: LibraryBook[];
    onAddBook: (file: File) => void;
    onBookClick: (book: LibraryBook) => void;
};

/** A simple Foliate-style bookshelf. */
export default function Library({ books, onAddBook, onBookClick }: LibraryProps) {
    const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) onAddBook(file);
        event.target.value = "";
    };

    return (
        <main className="library">
            <header className="library-header">
                <div>
                    <h1>LingoBok</h1>
                    <p>Your library</p>
                </div>
            </header>

            <section className="library-grid" aria-label="Bookshelf">
                {books.map((book) => (
                    <button className="book-card" key={book.id} type="button" onClick={() => onBookClick(book)}>
                        <BookCover title={book.title} coverUrl={book.coverUrl} />
                        <span className="book-title">{book.title}</span>
                    </button>
                ))}

                <label className="add-book-card">
                    <div className="add-book-cover">
                        <span className="add-icon">+</span>
                        <span>Add book</span>
                    </div>
                    <input hidden type="file" accept=".epub,application/epub+zip" onChange={handleFile} />
                </label>
            </section>
        </main>
    );
}
