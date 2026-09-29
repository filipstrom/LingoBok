export type BookCoverProps = {
    title: string;
    coverUrl?: string;
};

export default function BookCover({ title, coverUrl }: BookCoverProps) {
    return (
        <div className="book-cover">
            {coverUrl ? (
                <img src={coverUrl} alt={`Cover of ${title}`} />
            ) : (
                <div className="book-cover-placeholder" aria-label={`Cover of ${title}`}>
                    No cover
                </div>
            )}
        </div>
    );
}
