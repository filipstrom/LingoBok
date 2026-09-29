import { useEffect, useRef } from "react";
import "./App.css";

// Foliate registrerar <foliate-view>
import "./lib/foliate-js/view.js";

function App() {
  const readerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reader = readerRef.current;

    if (!reader) return;

    const handleRelocate = (event: Event) => {
      console.log("Reading position changed:", event);
    };

    reader.addEventListener("relocate", handleRelocate);

    return () => {
      reader.removeEventListener("relocate", handleRelocate);
    };
  }, []);

  async function openBook(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !readerRef.current) return;

    const reader = readerRef.current as HTMLElement & {
      open: (file: File) => Promise<void>;
      goTo: (target: number | string) => Promise<void>;
    };

    try {
      console.log("Opening:", file.name);

      await reader.open(file);

      console.log("Book opened");

      await reader.goTo(0);

      console.log("Moved to first section");
    } catch (error) {
      console.error("Failed to open EPUB:", error);
    }
  }
  function nextPage() {
    const reader = readerRef.current as HTMLElement & {
      next: () => Promise<void>;
    };

    reader.next();
  }

  function prevPage() {
    const reader = readerRef.current as HTMLElement & {
      prev: () => Promise<void>;
    };

    reader.prev();
  }

  return (
    <main>
      <input
        type="file"
        accept=".epub,application/epub+zip"
        onChange={openBook}
      />
      <div>
        <button onClick={prevPage}>Previous</button>
        <button onClick={nextPage}>Next</button>
      </div>

      <foliate-view ref={readerRef}></foliate-view>
    </main>
  );
}

export default App;