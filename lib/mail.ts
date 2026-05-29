import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const MAIL_FROM = process.env.MAIL_FROM!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function safe(value: string | number | null | undefined) {
  return String(value ?? "");
}

export async function sendReservationPinMail(params: {
  to: string;
  placeName: string;
  spotLabel: string;
  date: string;
  slot: string;
  plate: string;
  phone?: string | null;
  price: number;
  pin: string;
  googleMapUrl?: string | null;
  manageUrl?: string | null;
}) {
  const {
    to,
    placeName,
    spotLabel,
    date,
    slot,
    plate,
    phone,
    price,
    pin,
    googleMapUrl,
    manageUrl,
  } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】駐車場予約完了 / PINコードのお知らせ",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ParkTecをご利用いただきありがとうございます。</h2>
        <p>以下の内容で駐車場の予約が完了しました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          ${googleMapUrl ? `<div style="margin-top:4px"><a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-size:13px">📍 Google Mapで場所を確認する</a></div>` : ""}
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>利用時間:</strong> ${safe(slot)}</div>
          <div><strong>車両ナンバー:</strong> ${safe(plate)}</div>
          ${phone ? `<div><strong>電話番号:</strong> ${safe(phone)}</div>` : ""}
          <div><strong>お支払い金額:</strong> ${safe(price)} 円</div>
        </div>

        <p style="margin-top:20px">
          <strong>入庫・出庫方法</strong><br />
          入庫・出庫の両方で同じPINコードを使用します。<br />
          現地のQRコードを読み取り、PINコードを入力してください。
        </p>

        <div style="font-size:28px;font-weight:bold;letter-spacing:4px;padding:12px 16px;border:2px solid #111;display:inline-block;border-radius:8px">
          ${safe(pin)}
        </div>

        <div style="margin-top:20px;padding:14px 16px;border:1px solid #d1e7dd;border-radius:8px;background:#f0fdf4;color:#166534;font-size:13px">
          🧾 領収書の発行は出庫後にメールでご案内いたします。
        </div>

        ${
          manageUrl
            ? `
          <p style="margin-top:20px">
            <strong>予約管理（日付変更・キャンセル）</strong><br />
            <a href="${manageUrl}" target="_blank" rel="noopener noreferrer">${manageUrl}</a>
          </p>
        `
            : ""
        }

        <hr style="margin:24px 0" />
        <p>ParkTec</p>
      </div>
    `,
    text: `
ParkTecをご利用いただきありがとうございます。

駐車場: ${safe(placeName)}
区画: ${safe(spotLabel)}
利用日: ${safe(date)}
利用時間: ${safe(slot)}
車両ナンバー: ${safe(plate)}
${phone ? `電話番号: ${safe(phone)}` : ""}
お支払い金額: ${safe(price)} 円

入庫・出庫の両方で同じPINコードを使用します。
現地のQRコードを読み取り、PINコードを入力してください。

PINコード: ${safe(pin)}

※ 領収書の発行は出庫後にメールでご案内いたします。
${googleMapUrl ? `Google Map: ${googleMapUrl}` : ""}
${manageUrl ? `予約管理（日付変更・キャンセル）: ${manageUrl}` : ""}

ParkTec
    `.trim(),
  });
}

export async function sendCheckoutThanksMail(params: {
  to: string;
  placeName: string;
  spotLabel: string;
  useDate: string;
  checkIn?: string;
  checkOut?: string;
  minutes?: number | null;
  totalYen: number;
  paymentRef: string;
  flowLabel: "予約利用" | "時間貸し";
}) {
  const {
    to,
    placeName,
    spotLabel,
    useDate,
    checkIn,
    checkOut,
    minutes,
    totalYen,
    paymentRef,
    flowLabel,
  } = params;

  const receiptRequestUrl =
    `${APP_URL}/receipt/request?paymentRef=${encodeURIComponent(paymentRef)}`;

  const text = `
ご利用ありがとうございました。

■ 利用種別: ${flowLabel}
■ 駐車場: ${placeName}
■ 区画: ${spotLabel}
■ 利用日: ${useDate}
${checkIn ? `■ 入庫時間: ${checkIn}` : ""}
${checkOut ? `■ 出庫時間: ${checkOut}` : ""}
${minutes != null ? `■ 利用時間: ${minutes}分` : ""}
■ お支払い金額: ${totalYen.toLocaleString("ja-JP")}円

領収書をご希望の方は下記よりお進みください：
${receiptRequestUrl}
`.trim();

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】ご利用ありがとうございました",
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ParkTecをご利用いただきありがとうございました。</h2>
        <p>以下の内容でご利用が完了しました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>利用種別:</strong> ${safe(flowLabel)}</div>
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(useDate)}</div>
          ${checkIn ? `<div><strong>入庫時間:</strong> ${safe(checkIn)}</div>` : ""}
          ${checkOut ? `<div><strong>出庫時間:</strong> ${safe(checkOut)}</div>` : ""}
          ${minutes != null ? `<div><strong>利用時間:</strong> ${safe(minutes)} 分</div>` : ""}
          <div><strong>お支払い金額:</strong> ${Number(totalYen).toLocaleString("ja-JP")} 円</div>
        </div>

        <div style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px">
          <strong>領収書をご希望の方はこちら</strong><br />
          <a href="${receiptRequestUrl}" target="_blank" rel="noopener noreferrer">
            領収書を発行する
          </a>
        </div>

        <p style="margin-top:16px;font-size:12px;color:#666">
          ※ 宛名・但し書きを入力後、領収書を表示できます。
        </p>

        <hr style="margin:24px 0" />
        <p>またのご利用をお待ちしております。<br />ParkTec</p>
      </div>
    `,
  });
}

export async function sendReservationCanceledMail(params: {
  to: string;
  placeName: string;
  spotLabel: string;
  date: string;
  slot: string;
  name: string;
  plate: string;
  canceledAt: string;
  refundAmount: number;
  cancelFee: number;
  refundFee: number;
  reservationId?: string | null;
}) {
  const {
    to,
    placeName,
    spotLabel,
    date,
    slot,
    name,
    plate,
    canceledAt,
    refundAmount,
    cancelFee,
    refundFee,
    reservationId,
  } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】キャンセル完了のお知らせ",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>キャンセルが完了しました。</h2>
        <p>以下の内容でキャンセルを受け付けました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>利用時間:</strong> ${safe(slot)}</div>
          <div><strong>氏名:</strong> ${safe(name)}</div>
          <div><strong>車両ナンバー:</strong> ${safe(plate)}</div>
          <div><strong>キャンセル日時:</strong> ${safe(canceledAt)}</div>
        </div>

        <div style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fff">
          <div><strong>キャンセル料:</strong> ${safe(cancelFee)} 円</div>
          <div><strong>返金手数料:</strong> ${safe(refundFee)} 円</div>
          <div><strong>返金予定額:</strong> ${safe(refundAmount)} 円</div>
        </div>

        ${reservationId ? `
          <div style="margin-top:16px;padding:14px 16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
            <strong>🧾 領収書（キャンセル料）</strong><br />
            <a href="${APP_URL}/receipt/request?reservationId=${encodeURIComponent(reservationId)}" target="_blank" rel="noopener noreferrer">
              領収書を発行する
            </a>
          </div>
        ` : ""}

        <p style="margin-top:16px;font-size:12px;color:#666">
          ※ 返金がある場合、カード会社への反映まで数日かかることがあります。
        </p>

        <hr style="margin:24px 0" />
        <p>ParkTec</p>
      </div>
    `,
    text: `
キャンセルが完了しました。

駐車場: ${safe(placeName)}
区画: ${safe(spotLabel)}
利用日: ${safe(date)}
利用時間: ${safe(slot)}
氏名: ${safe(name)}
車両ナンバー: ${safe(plate)}
キャンセル日時: ${safe(canceledAt)}

キャンセル料: ${safe(cancelFee)} 円
返金手数料: ${safe(refundFee)} 円
返金予定額: ${safe(refundAmount)} 円${reservationId ? `\n領収書（キャンセル料）: ${APP_URL}/receipt/request?reservationId=${encodeURIComponent(reservationId)}` : ""}

※ 返金がある場合、カード会社への反映まで数日かかることがあります。

ParkTec
    `.trim(),
  });
}
export async function sendReservationDateChangedMail(params: {
  to: string;
  placeName: string;
  spotLabel: string;
  oldDate: string;
  newDate: string;
  name: string;
  plate: string;
}) {
  const { to, placeName, spotLabel, oldDate, newDate, name, plate } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】予約日変更完了のお知らせ",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>予約日の変更が完了しました。</h2>
        <p>以下の内容で日付変更を受け付けました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>変更前の利用日:</strong> <span style="text-decoration:line-through;color:#999">${safe(oldDate)}</span></div>
          <div><strong>変更後の利用日:</strong> <span style="color:#166534;font-weight:bold">${safe(newDate)}</span></div>
          <div><strong>氏名:</strong> ${safe(name)}</div>
          <div><strong>車両ナンバー:</strong> ${safe(plate)}</div>
        </div>

        <p style="margin-top:16px;font-size:13px;color:#555">
          ※ 日付変更は1回のみ可能です。再度の変更はお受けできませんのでご了承ください。
        </p>

        <hr style="margin:24px 0" />
        <p>ParkTec</p>
      </div>
    `,
    text: `
予約日の変更が完了しました。

駐車場: ${safe(placeName)}
区画: ${safe(spotLabel)}
変更前の利用日: ${safe(oldDate)}
変更後の利用日: ${safe(newDate)}
氏名: ${safe(name)}
車両ナンバー: ${safe(plate)}

※ 日付変更は1回のみ可能です。再度の変更はお受けできませんのでご了承ください。

ParkTec
    `.trim(),
  });
}

export async function sendGateUrlMail(params: {
  to: string;
  placeName: string;
  slot: string;
  gateUrl: string;
  name?: string | null;
}) {
  const { to, placeName, slot, gateUrl, name } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】ゲートURLのご案内",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>${safe(name) || "お客様"} 様</h2>
        <p>下記のURLからゲートを操作してください。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(slot)}</div>
        </div>

        <p style="margin-top:20px">
          <a href="${gateUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 22px;background:#111;color:#fff;border-radius:10px;font-weight:bold;text-decoration:none">
            ゲートを開く
          </a>
        </p>

        <p style="margin-top:16px;font-size:13px;color:#555;word-break:break-all">
          リンクが開けない場合は下記URLをコピーしてアクセスしてください：<br />
          ${gateUrl}
        </p>

        <hr style="margin:24px 0" />
        <p>ParkTec</p>
      </div>
    `,
    text: `${safe(name) || "お客様"} 様

下記のURLからゲートを操作してください。

駐車場: ${safe(placeName)}
区画: ${safe(slot)}

${gateUrl}

ParkTec`,
  });
}

export async function sendSettlementNotifyMail(params: {
  to: string;
  targetName: string;
  month: string;
  amount: number;
  pdfUrl: string;
}) {
  const { to, targetName, month, amount, pdfUrl } = params;
  const monthLabel = month.replace(/^(\d{4})-(\d{2})$/, "$1年$2月");
  const amountText = `¥${amount.toLocaleString("ja-JP")}`;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】${monthLabel}分 精算書のお知らせ`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <p>${safe(targetName)} 様</p>
        <p>いつもご利用いただきありがとうございます。<br />
        ${monthLabel}分の精算が完了いたしました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;margin:16px 0">
          <div style="font-size:13px;color:#6b7280">お支払額</div>
          <div style="font-size:24px;font-weight:bold">${amountText}</div>
        </div>

        <p>精算書の詳細は、PDFを添付しているか、または以下のページからご確認いただけます（要ログイン）。</p>
        <p>
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">
            精算書を確認する →
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280">
          ※ ご不明な点がございましたら、お気軽にお問い合わせください。
        </p>

        <hr style="margin:24px 0" />
        <p>
          パークテックイーストジャパン<br />
          TEL: 050-1793-4785<br />
          Email: info@parktec-ej.com
        </p>
      </div>
    `,
    text: `${safe(targetName)} 様

いつもご利用いただきありがとうございます。
${monthLabel}分の精算が完了いたしました。

お支払額: ${amountText}

精算書の詳細は、PDFを添付しているか、または以下のページからご確認いただけます（要ログイン）。
${pdfUrl}

ご不明な点がございましたら、お気軽にお問い合わせください。

パークテックイーストジャパン
TEL: 050-1793-4785
Email: info@parktec-ej.com`,
  });
}
