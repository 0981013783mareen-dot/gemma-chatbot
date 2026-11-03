export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "只接受 POST 請求。" });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return jsonResponse(500, {
      error: "伺服器尚未設定 HF_TOKEN 環境變數。"
    });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "請求內容不是有效的 JSON。" });
  }

  if (!Array.isArray(body.messages)) {
    return jsonResponse(400, { error: "缺少 messages 對話內容。" });
  }

  const messages = body.messages
    .filter((message) =>
      message &&
      ["user", "assistant"].includes(message.role) &&
      typeof message.content === "string"
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000)
    }));

  if (!messages.length) {
    return jsonResponse(400, { error: "請先輸入訊息。" });
  }

  const model = process.env.HF_MODEL || "google/gemma-4-E4B-it";

  try {
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "你是一位友善、清楚並使用繁體中文回答的助理。"
            },
            ...messages
          ],
          max_tokens: 700,
          temperature: 0.7
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Hugging Face API error:", response.status, result);
      return jsonResponse(response.status, {
        error: result.error?.message ||
          result.error ||
          "模型服務暫時無法使用。請檢查模型名稱、Token 權限或服務額度。"
      });
    }

    const content = result.choices?.[0]?.message?.content;
    const reply = Array.isArray(content)
      ? content.map((part) => part.text || "").join("")
      : content;

    if (!reply) {
      console.error("Unexpected model response:", result);
      return jsonResponse(502, { error: "模型沒有回傳文字，請稍後再試。" });
    }

    return jsonResponse(200, { reply });
  } catch (error) {
    console.error("Chat function error:", error);
    return jsonResponse(500, { error: "連線模型時發生錯誤，請稍後再試。" });
  }
};

function jsonResponse(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
