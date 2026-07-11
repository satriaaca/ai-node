import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

dotenv.config();

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const openai = new OpenAI({
    // baseURL: "https://openrouter.ai/api/v1",
    // apiKey: process.env.OPENROUTER_API_KEY
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY
});

app.post("/api/analyze", async (req, res) => {

    console.time("TOTAL");

    try {

        const { url, model } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: "URL wajib diisi"
            });
        }

        // ==========================
        // FETCH BERITA
        // ==========================

        console.time("Fetch berita");

        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        if (!response.ok) {
            throw new Error(
                `Gagal mengambil halaman (${response.status})`
            );
        }

        const html = await response.text();

        console.timeEnd("Fetch berita");

        // ==========================
        // READABILITY
        // ==========================

        console.time("Readability");

        const dom = new JSDOM(html, { url });

        const reader =
            new Readability(
                dom.window.document
            );

        const article =
            reader.parse();

        console.timeEnd("Readability");

        if (!article) {
            throw new Error(
                "Gagal mengekstrak isi artikel"
            );
        }

        const articleText =
            article.textContent || "";

        console.log(
            `Karakter artikel : ${articleText.length}`
        );

        console.log(
            `Estimasi token   : ${Math.ceil(articleText.length / 4)}`
        );

        // ==========================
        // PROMPT
        // ==========================

        const prompt = `
Bertindaklah sebagai Analis Intelijen Kejaksaan. Ubah berita berikut menjadi laporan resmi teks biasa tanpa markdown (*, #, atau bullet otomatis). Patuhi struktur baku ini:

Perihal: [10-15 kata, wajib kalimat pasif]

I. INFORMASI YANG DIPEROLEH

Bahwa pada hari [Hari ini] tanggal [Tanggal hari ini] [Fakta utama berita].

Bahwa [Fakta berikutnya].
(Ketentuan Bab I: Total 5-7 poin. Setiap poin wajib diawali kata "Bahwa", berisi 2-3 kalimat, dan murni fakta tanpa opini).

II. SUMBER INFORMASI
Bahwa informasi yang diperoleh merupakan organik Tim Intelijen Kejaksaan Negeri Tabanan.

III. TREND / PERKEMBANGAN

Bahwa [Analisis perkembangan/kecenderungan].

Bahwa [Analisis perkembangan/kecenderungan].
(Ketentuan Bab III: Minimal 2 poin. Setiap poin wajib diawali "Bahwa" dan berisi 1-2 kalimat).

IV. PENDAPAT / SARAN
Agar Intelijen Kejaksaan Negeri Tabanan tetap berkoordinasi dengan instansi terkait kegiatan yang dilaksanakan di kabupaten Tabanan dan agar dapat dilaporkan kepada pimpinan secara berjenjang.

Gunakan bahasa Indonesia formal, objektif, dan dinas.
`;

        // ==========================
        // OPENROUTER
        // ==========================

        console.time("OpenRouter");

        console.log(
            "Mengirim request ke OpenRouter..."
        );

        const completion =
            await Promise.race([
                openai.chat.completions.create({
                    model:
                        model ||
                        "meta-llama/llama-4-scout-17b-16e-instruct",
                        // "deepseek/deepseek-chat-v3-0324",
                        // "nvidia/nemotron-3-ultra-550b-a55b:free",

                    messages: [
                        {
                            role: "system",
                            content: prompt
                        },
                        {
                            role: "user",
                            content: `
Judul:
${article.title}

Isi Artikel:
${articleText}
`
                        }
                    ],

                    max_tokens: 2000
                }),

                new Promise((_, reject) =>
                    setTimeout(() => {
                        reject(
                            new Error(
                                "OpenRouter timeout setelah 60 detik"
                            )
                        );
                    }, 60000)
                )
            ]);

        console.log(
            "OpenRouter selesai"
        );

        console.timeEnd("OpenRouter");

        console.log(
            "finish_reason:",
            completion.choices?.[0]?.finish_reason
        );

        console.log(
            "usage:",
            completion.usage
        );

        console.timeEnd("TOTAL");

        res.json({
            success: true,
            title: article.title,
            analysis:
                completion.choices[0]
                    .message.content
        });

    } catch (error) {

        console.timeEnd("TOTAL");

        console.error(
            "ERROR:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default app;