import { COPY } from "./constants";
import styles from "./styles.module.css";

export default function Home() {
    return (
        <main className={styles.page} data-testid="home-page">
            <h1 className={styles.title}>{COPY.title}</h1>
            <p className={styles.subtitle}>{COPY.subtitle}</p>
            <section className={styles.placeholder} data-testid="home-placeholder">
                {COPY.placeholder}
            </section>
        </main>
    );
}
