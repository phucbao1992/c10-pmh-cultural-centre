import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(path.join(process.cwd(), "public")));

  // API Route: Analyze Monitoring data with Gemini
  app.post("/api/gemini/analyze-monitoring", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const { monitoringData } = req.body;
      if (!monitoringData) {
        return res.status(400).json({ error: "Missing monitoring data for analysis." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Prepare compact data for all 7 monitoring systems
      const compactData: Record<string, any> = {};
      const sections = [
        { key: "icl", label: "Tường vây (ICL)", data: monitoringData.iclData, headers: monitoringData.iclHeaders },
        { key: "tc", label: "Móng cẩu tháp (TC)", data: monitoringData.tcData, headers: monitoringData.tcHeaders },
        { key: "ss", label: "Ứng suất thanh giằng (SS)", data: monitoringData.ssData, headers: monitoringData.ssHeaders },
        { key: "sm", label: "Lún nhà lân cận (SM)", data: monitoringData.smData, headers: monitoringData.smHeaders },
        { key: "tm", label: "Nghiêng nhà lân cận (TM)", data: monitoringData.tmData, headers: monitoringData.tmHeaders },
        { key: "rsm", label: "Lún nền đường (RSM)", data: monitoringData.rsmData, headers: monitoringData.rsmHeaders },
        { key: "tdw", label: "Đỉnh tường vây (TDW)", data: monitoringData.tdwData, headers: monitoringData.tdwHeaders },
      ];

      sections.forEach(sec => {
        if (sec.data && Array.isArray(sec.data) && sec.data.length > 0) {
          compactData[sec.key] = {
            label: sec.label,
            headers: sec.headers,
            recentReadings: sec.data.slice(-5)
          };
        }
      });

      const contextStr = JSON.stringify(compactData, null, 2);

      const systemInstruction = `
You are an expert geotechnical engineer analyzing construction monitoring data for a 20-storey building with 2 basements.
Your task is to analyze the provided monitoring JSON data and extract EXACTLY the 4 key metrics for executive management:

1. lastUpdateDate: The date string of the latest reading cycle (e.g., "18/07/2026").
2. maxPoint: The sensor with the maximum absolute displacement or stress reading in the latest cycle.
   - sensor: Sensor ID (e.g., "ICL-04")
   - val: Absolute numerical value (e.g. 14.2)
   - unit: Measurement unit ("mm" or "Mpa")
   - title: Section title in Vietnamese (e.g. "Tường vây (ICL)")
3. closestThresholdPoint: The sensor closest to or exceeding its warning threshold in percentage.
   - sensor: Sensor ID
   - ratio: Percentage relative to warning threshold rounded to 1 decimal place (e.g. 71.0)
   - val: Latest absolute value (e.g. 14.2)
   - warningVal: Warning threshold value (e.g. 20)
   - unit: Measurement unit
   - title: Section title
4. worstTrendPoint: The sensor with the highest positive increase in value between the last 2 cycles.
   - sensor: Sensor ID
   - delta: Change value rounded to 2 decimal places (e.g. 1.25)
   - unit: Measurement unit
   - title: Section title
5. status: "SAFE" if all ratios < 80%, "WARNING" if any ratio >= 80% and < 100%, "DANGER" if any ratio >= 100%.
6. statusMessage: A 1-sentence clear engineering summary in Vietnamese (e.g., "Tất cả các chỉ số quan trắc biến dạng nằm trong giới hạn cho phép.").
`;

      const prompt = `
Analyze the dataset below and extract the 4 executive summary metrics.

Dataset:
${contextStr}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      if (response.text) {
        const jsonResult = JSON.parse(response.text);
        res.json({ metrics: jsonResult });
      } else {
        throw new Error("Empty response from Gemini.");
      }
    } catch (err: any) {
      console.error("Gemini analysis error:", err);
      res.status(500).json({ error: err.message || "An error occurred during AI analysis." });
    }
  });

  // API Route: Summarize Daily Report with Gemini Flash
  app.post("/api/gemini/summarize-daily-report", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ." });
      }

      const { reportData } = req.body;
      if (!reportData) {
        return res.status(400).json({ error: "Thiếu dữ liệu báo cáo ngày để phân tích." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const systemInstruction = `
Bạn là Giám đốc Dự án / Kỹ sư trưởng giàu kinh nghiệm đang đánh giá Báo cáo ngày (Daily Report) của Dự án C10 - Nhà Văn Hóa Phú Mỹ Hưng.
Dựa trên toàn bộ dữ liệu báo cáo ngày JSON được cung cấp (thông tin chung, thời tiết, an toàn, nhân lực, thiết bị, vật tư nhập, khối lượng công việc hôm nay & kế hoạch ngày mai, công tác nghiệm thu), hãy tổng hợp và trả về ĐÚNG định dạng JSON gồm các trường sau (bằng tiếng Việt, ngắn gọn, súc tích, chuyên nghiệp):
{
  "overallAssessment": "Nhận xét tổng quan 1-2 câu về tình hình thi công trong ngày, thời tiết, nhân lực và mức độ đáp ứng tiến độ.",
  "weatherSummary": "Tóm tắt ngắn gọn điều kiện thời tiết trong ngày (ví dụ: Sáng nắng, chiều mưa 1h05p - ảnh hưởng nhẹ công tác đào đất).",
  "highlights": [
    "Điểm nổi bật 1 về nhân lực/thiết bị hoặc khối lượng thi công đạt được trong ngày",
    "Điểm nổi bật 2 về vật tư nhập hoặc công tác nghiệm thu",
    "Điểm nổi bật 3 về an toàn lao động và vệ sinh môi trường"
  ],
  "tomorrowFocus": [
    "Trọng tâm kế hoạch ngày tiếp theo 1",
    "Trọng tâm kế hoạch ngày tiếp theo 2"
  ],
  "recommendations": [
    "Lưu ý / Kiến nghị điều hành cho Ban chỉ huy 1"
  ]
}
`;

      const prompt = `Hãy phân tích và tóm tắt dữ liệu Báo cáo ngày dưới đây:\n\n${JSON.stringify(reportData, null, 2)}`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          },
        });
      } catch {
        response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          },
        });
      }

      if (response.text) {
        const summary = JSON.parse(response.text);
        return res.json({ success: true, summary });
      } else {
        throw new Error("Không nhận được phản hồi từ Gemini Flash.");
      }
    } catch (err: any) {
      console.error("Gemini daily report summary error:", err);
      return res.status(500).json({ error: err.message || "Lỗi khi tổng hợp báo cáo bằng Gemini Flash." });
    }
  });

  // API Route: Get latest weekly report PDF from Google Drive folder
  let cachedLatestWeekly: { data: any; timestamp: number } | null = null;
  app.get("/api/drive/latest-weekly-report", async (req, res) => {
    try {
      const now = Date.now();
      if (cachedLatestWeekly && (now - cachedLatestWeekly.timestamp) < 5 * 60 * 1000) {
        return res.json(cachedLatestWeekly.data);
      }

      const folderId = (req.query.folderId as string) || "1K27iyUSy7hER-oo2qmHairwEAA2dpwsy";
      const driveRes = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!driveRes.ok) {
        throw new Error(`Drive folder responded with status ${driveRes.status}`);
      }

      const html = await driveRes.text();
      const files: { id: string; name: string }[] = [];
      const idRegex = /"([a-zA-Z0-9_-]{28,35})"[^\]]*?([a-zA-Z0-9_\-\.\s]+\.pdf)/gi;
      let m;
      while ((m = idRegex.exec(html)) !== null) {
        const id = m[1];
        const name = m[2].replace(/^x22/, "");
        if (!files.some(f => f.id === id)) {
          files.push({ id, name });
        }
      }

      if (files.length > 0) {
        // Sort descending by name (e.g. 008 > 007 > 006...)
        files.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" }));
        const latest = files[0];
        const result = {
          id: latest.id,
          name: latest.name,
          viewLink: `https://drive.google.com/file/d/${latest.id}/view`,
          folderLink: `https://drive.google.com/drive/folders/${folderId}`,
          allFiles: files
        };
        cachedLatestWeekly = { data: result, timestamp: now };
        return res.json(result);
      }

      // Default fallback
      const defaultFallback = {
        id: "1CKseiRJTkQpHtj1Fjc_8Mio3IGoLVnPn",
        name: "MD31-CC1-SRF-WRPT-008.pdf",
        viewLink: "https://drive.google.com/file/d/1CKseiRJTkQpHtj1Fjc_8Mio3IGoLVnPn/view",
        folderLink: `https://drive.google.com/drive/folders/${folderId}`
      };
      res.json(defaultFallback);
    } catch (err: any) {
      console.warn("Failed to fetch latest weekly report dynamically:", err.message);
      res.json({
        id: "1CKseiRJTkQpHtj1Fjc_8Mio3IGoLVnPn",
        name: "MD31-CC1-SRF-WRPT-008.pdf",
        viewLink: "https://drive.google.com/file/d/1CKseiRJTkQpHtj1Fjc_8Mio3IGoLVnPn/view",
        folderLink: "https://drive.google.com/drive/folders/1K27iyUSy7hER-oo2qmHairwEAA2dpwsy"
      });
    }
  });

  // API Route: Get latest uploaded monitoring file in public/assets/aistudio in real-time
  app.get("/api/monitoring/latest-file", (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      const dirPath = path.join(process.cwd(), "public", "assets", "aistudio");
      if (!fs.existsSync(dirPath)) {
        return res.status(404).json({ error: "Assets directory not found" });
      }
      const entries = fs.readdirSync(dirPath);
      const candidates = entries
        .filter((name) => {
          const lower = name.toLowerCase();
          return (
            lower.includes("quan_tr") ||
            lower.includes("quan-tr") ||
            lower.includes("quantrac") ||
            lower.endsWith(".csv") ||
            lower.endsWith(".xlsx")
          );
        })
        .map((name) => {
          const fullPath = path.join(dirPath, name);
          const stat = fs.statSync(fullPath);
          return {
            name,
            fullPath,
            mtimeMs: stat.mtimeMs,
          };
        })
        .sort((a, b) => {
          if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
          // Tie-breaker: prefer _23372c5e over older snapshots
          if (a.name.includes("23372c5e")) return -1;
          if (b.name.includes("23372c5e")) return 1;
          return b.name.localeCompare(a.name);
        });

      if (candidates.length === 0) {
        return res.status(404).json({ error: "No monitoring file found" });
      }

      const newest = candidates[0];
      const content = fs.readFileSync(newest.fullPath, "utf-8");
      return res.json({
        fileName: newest.name,
        path: `/assets/aistudio/${newest.name}`,
        mtimeMs: newest.mtimeMs,
        content,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to read latest monitoring file" });
    }
  });

  // API Route: Proxy Google Apps Script Webhook for C10 Daily Report (Save PDF to Drive + Sync Quantities to Google Sheet C10)
  app.post("/api/daily-report/sync-webhook", async (req, res) => {
    try {
      const { webhookUrl, payload } = req.body || {};
      if (!webhookUrl || typeof webhookUrl !== "string" || !webhookUrl.startsWith("https://script.google.com/")) {
        return res.status(400).json({
          success: false,
          error: "Vui lòng nhập URL Web App hợp lệ của Google Apps Script (bắt đầu bằng https://script.google.com/...)."
        });
      }

      const response = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload || {}),
        redirect: "follow"
      });

      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      if (response.ok && (parsed?.success !== false)) {
        return res.json({
          success: true,
          result: parsed
        });
      }

      return res.status(502).json({
        success: false,
        error: parsed?.error || `Google Apps Script trả về mã trạng thái ${response.status}`,
        result: parsed
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || "Không thể kết nối tới Webhook Google Apps Script."
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
