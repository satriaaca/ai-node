import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

dotenv.config();

const app = express();

app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
    // baseURL: "https://openrouter.ai/api/v1",
    // apiKey: process.env.OPENROUTER_API_KEY

    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY
});

app.post("/api/analyze", async (req, res) => {

    console.time("TOTAL");

    try {

        const {
            url,
            articleText: inputText,
            model
        } = req.body;

        if (!url && !inputText) {
            return res.status(400).json({
                success: false,
                error: "Isi URL atau teks berita."
            });
        }

        let articleTitle = "";
        let articleText = "";

        // ==================================================
        // MODE URL
        // ==================================================

        if (url) {

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

            console.time("Readability");

            const dom = new JSDOM(html, { url });

            const reader = new Readability(
                dom.window.document
            );

            const article = reader.parse();

            console.timeEnd("Readability");

            if (!article) {
                throw new Error(
                    "Gagal mengekstrak isi artikel"
                );
            }

            articleTitle =
                article.title || "";

            articleText =
                article.textContent || "";

        }

        // ==================================================
        // MODE INPUT MANUAL
        // ==================================================

        else {

            console.log(
                "Menggunakan input teks manual"
            );

            articleTitle = "Input Manual";
            articleText = inputText;

        }

        console.log(
            `Karakter artikel : ${articleText.length}`
        );

        console.log(
            `Estimasi token : ${Math.ceil(articleText.length / 4)}`
        );

        // ==================================================
        // PROMPT
        // ==================================================

        const prompt = `
Bertindaklah sebagai Analis Intelijen Kejaksaan.

Ubah berita berikut menjadi laporan resmi teks biasa tanpa markdown.

Patuhi struktur berikut:

Perihal: [10-15 kata, wajib kalimat pasif]

I. INFORMASI YANG DIPEROLEH

Bahwa pada hari [Hari ini] tanggal [Tanggal hari ini] [Fakta utama berita].

Bahwa [Fakta berikutnya].

(Ketentuan Bab I:
- Total 6-7 poin.
- Setiap poin diawali "Bahwa".
- Tiap poin 3-4 kalimat.
- Murni fakta tanpa opini.)

II. SUMBER INFORMASI

Bahwa informasi yang diperoleh merupakan organik Tim Intelijen Kejaksaan Negeri Tabanan.

III. TREND / PERKEMBANGAN

Bahwa [Analisis].

Bahwa [Analisis].

(Ketentuan:
Minimal 2 poin.
Setiap poin diawali "Bahwa".)

IV. PENDAPAT / SARAN

Agar Intelijen Kejaksaan Negeri Tabanan tetap berkoordinasi dengan instansi terkait kegiatan yang dilaksanakan di Kabupaten Tabanan dan agar dapat dilaporkan kepada pimpinan secara berjenjang.

Gunakan bahasa Indonesia formal, objektif, dan dinas.
`;

        // ==================================================
        // OPENAI
        // ==================================================

        console.time("OpenAI");

        console.log("Mengirim request...");

        const completion =
            await Promise.race([

                openai.chat.completions.create({

                    model:
                        model ||
                        "meta-llama/llama-4-scout-17b-16e-instruct",

                    messages: [

                        {
                            role: "system",
                            content: prompt
                        },

                        {
                            role: "user",
                            content: `
Judul:
${articleTitle}

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
                                "AI timeout setelah 60 detik"
                            )
                        );

                    }, 60000)
                )

            ]);

        console.timeEnd("OpenAI");

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

            title: articleTitle,

            analysis:
                completion.choices[0]
                    .message.content

        });

    } catch (error) {

        console.timeEnd("TOTAL");

        console.error(error);

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

app.use(express.static("public"));

app.get("/", (req, res) => {

    res.sendFile(

        path.join(
            process.cwd(),
            "public",
            "index.html"
        )

    );

});

export default app;