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
    onChooseFolder: () => void;
    onBookClick: (book: LibraryBook) => void;
};

/** A simple Foliate-style bookshelf. */
export default function Library({ books, onChooseFolder, onBookClick }: LibraryProps) {
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

                <button className="add-book-card" type="button" onClick={onChooseFolder}>
                    <div className="add-book-cover">
                        <span className="add-icon">+</span>
                        <span>Choose book folder</span>
                    </div>
                </button>
            </section>
        </main>
    );
}
