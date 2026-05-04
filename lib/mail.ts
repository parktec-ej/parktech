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
    price,
    pin,
    googleMapUrl,
    manageUrl,
  } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTech】駐車場予約完了 / PINコードのお知らせ",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ParkTechをご利用いただきありがとうございます。</h2>
        <p>以下の内容で駐車場の予約が完了しました。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>利用時間:</strong> ${safe(slot)}</div>
          <div><strong>車両ナンバー:</strong> ${safe(plate)}</div>
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

        ${
          googleMapUrl
            ? `
          <p style="margin-top:20px">
            <strong>Google Map</strong><br />
            <a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer">${googleMapUrl}</a>
          </p>
        `
            : ""
        }

        ${
          manageUrl
            ? `
          <p style="margin-top:20px">
            <strong>予約確認・キャンセル</strong><br />
            <a href="${manageUrl}" target="_blank" rel="noopener noreferrer">${manageUrl}</a>
          </p>
        `
            : ""
        }

        <hr style="margin:24px 0" />
        <p>ParkTech</p>
      </div>
    `,
    text: `
ParkTechをご利用いただきありがとうございます。

駐車場: ${safe(placeName)}
区画: ${safe(spotLabel)}
利用日: ${safe(date)}
利用時間: ${safe(slot)}
車両ナンバー: ${safe(plate)}
お支払い金額: ${safe(price)} 円

入庫・出庫の両方で同じPINコードを使用します。
現地のQRコードを読み取り、PINコードを入力してください。

PINコード: ${safe(pin)}
${googleMapUrl ? `Google Map: ${googleMapUrl}` : ""}
${manageUrl ? `予約確認・キャンセル: ${manageUrl}` : ""}

ParkTech
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
    subject: "【ParkTech】ご利用ありがとうございました",
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ParkTechをご利用いただきありがとうございました。</h2>
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
        <p>またのご利用をお待ちしております。<br />ParkTech</p>
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
  } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTech】キャンセル完了のお知らせ",
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

        <p style="margin-top:16px;font-size:12px;color:#666">
          ※ 返金がある場合、カード会社への反映まで数日かかることがあります。
        </p>

        <hr style="margin:24px 0" />
        <p>ParkTech</p>
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
返金予定額: ${safe(refundAmount)} 円

※ 返金がある場合、カード会社への反映まで数日かかることがあります。

ParkTech
    `.trim(),
  });
}