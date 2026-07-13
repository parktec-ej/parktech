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
            <strong>予約管理（予約確認・日付変更・キャンセル）</strong><br />
            <a href="${manageUrl}" target="_blank" rel="noopener noreferrer">${manageUrl}</a>
          </p>

          <div style="margin-top:16px;padding:12px 16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;font-size:12px;color:#555;line-height:1.7">
            <strong>キャンセルポリシー</strong><br>
            ・利用日の48時間前まで: 手数料320円でキャンセル可能<br>
            ・利用日の48時間以内: キャンセル不可（全額請求）<br>
            <strong>日付変更</strong><br>
            ・予約受付から24時間以内: 1回まで無料で変更可能
          </div>
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
${manageUrl ? `予約管理（予約確認・日付変更・キャンセル）: ${manageUrl}

キャンセルポリシー:
・利用日の48時間前まで: 手数料320円でキャンセル可能
・利用日の48時間以内: キャンセル不可（全額請求）
日付変更:
・予約受付から24時間以内: 1回まで無料で変更可能` : ""}

ParkTec
    `.trim(),
  });
}

export async function sendMonthlyPaymentLinkMail(params: {
  to: string;
  name: string;
  placeName: string;
  planLabel: string;
  termLabel: string;
  totalFeeYen: number;
  isSubscription: boolean;
  checkoutUrl: string;
}) {
  const { to, name, placeName, planLabel, termLabel, totalFeeYen, isSubscription, checkoutUrl } = params;
  const feeNote = isSubscription ? "（毎月のお支払い・自動継続）" : "（一括前払い）";

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】月極駐車場 お支払い手続きのご案内",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>お申込みが承認されました</h2>
        <p>${safe(name)} 様</p>
        <p>月極駐車場のお申込みを承認いたしました。下記ボタンよりお支払い手続きをお願いします。お支払いの完了をもってご契約成立となります。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>プラン:</strong> ${safe(planLabel)}</div>
          <div><strong>お支払い:</strong> ${safe(termLabel)}</div>
          <div><strong>金額:</strong> ${safe(totalFeeYen)} 円（税込）${feeNote}</div>
        </div>

        <p style="margin-top:24px;text-align:center">
          <a href="${checkoutUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 28px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
            お支払いへ進む
          </a>
        </p>
        <p style="font-size:12px;color:#666">ボタンが開けない場合はこちらのURLをブラウザに貼り付けてください:<br />${checkoutUrl}</p>

        <hr style="margin:24px 0" />
        <p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `お申込みが承認されました。
${safe(name)} 様

月極駐車場のお申込みを承認いたしました。
下記URLよりお支払い手続きをお願いします。お支払いの完了をもってご契約成立となります。

駐車場: ${safe(placeName)}
プラン: ${safe(planLabel)}
お支払い: ${safe(termLabel)}
金額: ${safe(totalFeeYen)} 円（税込）${feeNote}

お支払い: ${checkoutUrl}

パークテックイーストジャパン`.trim(),
  });
}

export async function sendMonthlyContractActivatedMail(params: {
  to: string;
  name: string;
  placeName: string;
  loginUrl: string;
  tempPassword: string;
  startDate: string;
  endDate?: string | null;
}) {
  const { to, name, placeName, loginUrl, tempPassword, startDate, endDate } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】月極駐車場 ご契約が成立しました",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ご契約が成立しました</h2>
        <p>${safe(name)} 様</p>
        <p>お支払いを確認し、月極駐車場のご契約が成立しました。ありがとうございます。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>契約開始日:</strong> ${safe(startDate)}</div>
          ${endDate ? `<div><strong>契約満了日:</strong> ${safe(endDate)}</div>` : `<div><strong>更新:</strong> 毎月自動更新</div>`}
        </div>

        <div style="margin-top:20px;padding:16px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff">
          <strong>契約者ページ ログイン情報</strong><br />
          <div style="margin-top:8px"><strong>ログインURL:</strong> <a href="${loginUrl}">${loginUrl}</a></div>
          <div><strong>メールアドレス:</strong> ${safe(to)}</div>
          <div><strong>仮パスワード:</strong> <span style="font-family:monospace;font-size:16px">${safe(tempPassword)}</span></div>
          <div style="font-size:12px;color:#555;margin-top:8px">契約者ページから、イベント開催日の確認・必要に応じた予約・契約内容・領収書発行ができます。</div>
        </div>

        <div style="margin-top:20px;padding:14px 16px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-size:13px;line-height:1.7">
          <strong>ご利用上の注意</strong><br />
          ・イベント開催日は月極でのご利用ができません（イベント日は事前にメールでお知らせします）。<br />
          ・イベント日の駐車をご希望の場合は契約者ページから別途ご予約・追加料金が必要です（プラン2のみ）。<br />
          ・イベント日の無断駐車には違約金（1回 16,000円）が発生します。
        </div>

        <hr style="margin:24px 0" />
        <p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `ご契約が成立しました。
${safe(name)} 様

お支払いを確認し、月極駐車場のご契約が成立しました。

駐車場: ${safe(placeName)}
契約開始日: ${safe(startDate)}
${endDate ? `契約満了日: ${safe(endDate)}` : "更新: 毎月自動更新"}

【契約者ページ ログイン情報】
ログインURL: ${loginUrl}
メールアドレス: ${safe(to)}
仮パスワード: ${safe(tempPassword)}

契約者ページから、イベント日の確認・予約・契約内容・領収書発行ができます。

【ご利用上の注意】
・イベント開催日は月極でのご利用ができません。
・イベント日の駐車希望は契約者ページから別途予約・追加料金（プラン2のみ）。
・イベント日の無断駐車には違約金（1回16,000円）が発生します。

パークテックイーストジャパン`.trim(),
  });
}

export async function sendMonthlyContractCanceledMail(params: {
  to: string;
  name: string;
  placeName: string;
}) {
  const { to, name, placeName } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】月極駐車場 解約手続きが完了しました",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>解約手続きが完了しました</h2>
        <p>${safe(name)} 様</p>
        <p>月極駐車場（${safe(placeName)}）の解約手続きが完了しました。ご利用ありがとうございました。</p>
        <p style="font-size:13px;color:#555">前払いプランの場合、ご返金はございません（規約に基づく）。月払いプランの場合、以降の自動課金は停止されます。</p>
        <hr style="margin:24px 0" />
        <p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `解約手続きが完了しました。
${safe(name)} 様

月極駐車場（${safe(placeName)}）の解約手続きが完了しました。
ご利用ありがとうございました。

前払いプランの場合、ご返金はございません（規約に基づく）。
月払いプランの場合、以降の自動課金は停止されます。

パークテックイーストジャパン`.trim(),
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

export async function sendMonthlyApplicationReceivedMail(params: {
  to: string;
  name: string;
  placeName: string;
  planLabel: string;
  billingTermLabel: string;
  totalFeeYen: number;
}) {
  const { to, name, placeName, planLabel, billingTermLabel, totalFeeYen } =
    params;
  const amountText = `¥${Number(totalFeeYen).toLocaleString("ja-JP")}`;

  const text = `${safe(name)} 様

月極駐車場のお申し込みを受け付けました。
内容を確認のうえ、担当者より順次ご連絡いたします。

■ 駐車場: ${safe(placeName)}
■ プラン: ${safe(planLabel)}
■ お支払いプラン: ${safe(billingTermLabel)}
■ お支払い予定額: ${amountText}（税込）

※ このメールは申込受付の自動返信です。この時点では契約は成立しておりません。
※ 審査・ご連絡のうえ、お支払い手続きのご案内を改めてお送りします。
※ ご不明な点がございましたら、本メールにそのままご返信ください。

パークテックイーストジャパン
TEL: 050-1793-4785
Email: info@parktec-ej.com`;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】月極駐車場 お申し込みを受け付けました",
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>${safe(name)} 様</h2>
        <p>
          月極駐車場のお申し込みを受け付けました。<br />
          内容を確認のうえ、担当者より順次ご連絡いたします。
        </p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>プラン:</strong> ${safe(planLabel)}</div>
          <div><strong>お支払いプラン:</strong> ${safe(billingTermLabel)}</div>
          <div><strong>お支払い予定額:</strong> ${amountText}（税込）</div>
        </div>

        <div style="margin-top:20px;padding:14px 16px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-size:13px;line-height:1.7">
          ※ このメールは申込受付の自動返信です。この時点では契約は成立しておりません。<br />
          審査・ご連絡のうえ、お支払い手続きのご案内を改めてお送りします。
        </div>

        <p style="margin-top:16px;font-size:13px;color:#555">
          ご不明な点がございましたら、本メールにそのままご返信ください。
        </p>

        <hr style="margin:24px 0" />
        <p>
          パークテックイーストジャパン<br />
          TEL: 050-1793-4785<br />
          Email: info@parktec-ej.com
        </p>
      </div>
    `,
  });
}

export async function sendMonthlyEventNoticeMail(params: {
  to: string;
  placeName: string;
  eventName: string;
  date: string;
  reserveUrl: string;
  declineUrl: string;
  dashboardUrl: string;
  deadlineNote: string;
}) {
  const {
    to,
    placeName,
    eventName,
    date,
    reserveUrl,
    declineUrl,
    dashboardUrl,
    deadlineNote,
  } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】イベント日のご利用確認（${safe(date)}）`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>イベント開催日のご利用確認</h2>
        <p>月極駐車場をご利用いただきありがとうございます。<br />
        下記イベント開催日について、当日に駐車場をご利用になるかご回答ください。</p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>イベント:</strong> ${safe(eventName)}</div>
          <div><strong>開催日:</strong> ${safe(date)}</div>
        </div>

        <p style="margin-top:20px"><strong>${safe(
          deadlineNote
        )}にご回答ください。</strong><br />
        ご回答がない場合、当日のご利用区画は一般のお客様の予約に開放されます。</p>

        <div style="margin-top:16px">
          <a href="${reserveUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;margin-right:8px">この日に予約する（駐車料金のお支払いへ）</a>
          <a href="${declineUrl}" style="display:inline-block;background:#fff;color:#111;text-decoration:none;padding:12px 20px;border-radius:8px;border:1px solid #111;font-weight:bold">利用しない</a>
        </div>

        <p style="margin-top:20px;font-size:13px;color:#555">
          ボタンが開かない場合は契約者ページからもお手続きいただけます：<br />
          <a href="${dashboardUrl}">${dashboardUrl}</a>
        </p>

        <hr style="margin:24px 0" />
        <p>
          パークテックイーストジャパン<br />
          TEL: 050-1793-4785<br />
          Email: info@parktec-ej.com
        </p>
      </div>
    `,
    text: `イベント開催日のご利用確認

駐車場: ${safe(placeName)}
イベント: ${safe(eventName)}
開催日: ${safe(date)}

${safe(deadlineNote)}にご回答ください。
ご回答がない場合、当日のご利用区画は一般のお客様の予約に開放されます。

この日に予約する: ${reserveUrl}
利用しない: ${declineUrl}

契約者ページ: ${dashboardUrl}

パークテックイーストジャパン
TEL: 050-1793-4785
Email: info@parktec-ej.com`,
  });
}

export async function sendMonthlyOfferNoticeMail(params: {
  to: string;
  tenantName: string;
  placeName: string;
  spotLabel: string;
  date: string;
  useUrl: string;
  declineUrl: string;
  dashboardUrl: string;
  deadlineNote: string;
}) {
  const { to, tenantName, placeName, spotLabel, date, useUrl, declineUrl, dashboardUrl, deadlineNote } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】あなたの月極区画に利用希望者がいます（${safe(date)}）`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>イベント開催日 区画利用のご確認</h2>
        <p>${safe(tenantName)} 様</p>
        <p>下記イベント開催日について、一般のお客様から<strong>あなたの月極区画のご利用希望</strong>が入りました。<br />
        当日ご自身で駐車される場合は「利用する」、利用されない場合は「希望者にお譲りする」をお選びください。</p>
        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>開催日:</strong> ${safe(date)}</div>
        </div>
        <p style="margin-top:20px"><strong>${safe(deadlineNote)}にご回答ください。</strong><br />
        ご回答がない場合、当日のご利用区画は希望者にお譲りします（自動）。</p>
        <div style="margin-top:16px">
          <a href="${useUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;margin-right:8px">利用する（当日ご自身で駐車）</a>
          <a href="${declineUrl}" style="display:inline-block;background:#fff;color:#111;text-decoration:none;padding:12px 20px;border-radius:8px;border:1px solid #111;font-weight:bold">利用しない（希望者にお譲り）</a>
        </div>
        <p style="margin-top:12px;font-size:13px;color:#555">
          ※「利用する」を選ぶと、当日分の駐車料金がご登録のカードから自動的にお支払いとなります。
        </p>
        <p style="margin-top:16px;font-size:13px;color:#555">契約者ページ：<a href="${dashboardUrl}">${dashboardUrl}</a></p>
        <hr style="margin:24px 0" />
        <p>パークテックイーストジャパン<br />TEL: 050-1793-4785<br />Email: info@parktec-ej.com</p>
      </div>
    `,
    text: `イベント開催日 区画利用のご確認
${safe(tenantName)} 様

${safe(date)} のイベント開催日に、あなたの月極区画(${safe(spotLabel)})の利用希望者がいます。
${safe(deadlineNote)}にご回答ください。ご回答がない場合は希望者にお譲りします。

利用する（当日ご自身で駐車・カード自動決済）: ${useUrl}
利用しない（希望者にお譲り）: ${declineUrl}

パークテックイーストジャパン`.trim(),
  });
}

export async function sendOfferApplicantPaymentMail(params: {
  to: string;
  name: string;
  placeName: string;
  spotLabel: string;
  date: string;
  priceYen: number;
  checkoutUrl: string;
}) {
  const { to, name, placeName, spotLabel, date, priceYen, checkoutUrl } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】ご予約が承認されました。お支払いのご案内（${safe(date)}）`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ご予約が承認されました</h2>
        <p>${safe(name)} 様</p>
        <p>お申し込みいただいた区画のご利用が承認されました。下記ボタンよりお支払いをお願いします。<br />
        <strong>お支払いの完了をもってご予約確定</strong>となります。</p>
        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>料金:</strong> ${safe(priceYen)} 円（税込）</div>
        </div>
        <p style="margin-top:24px;text-align:center">
          <a href="${checkoutUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 28px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">お支払いへ進む</a>
        </p>
        <p style="font-size:12px;color:#666">ボタンが開けない場合はこちらのURLを貼り付けてください:<br />${checkoutUrl}</p>
        <p style="font-size:13px;color:#555">※お支払いは開催日の3日前までにお願いします。期限を過ぎるとご予約は無効となります。</p>
        <hr style="margin:24px 0" />
        <p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `ご予約が承認されました。
${safe(name)} 様

お支払いの完了をもってご予約確定となります。
駐車場: ${safe(placeName)}
区画: ${safe(spotLabel)}
利用日: ${safe(date)}
料金: ${safe(priceYen)} 円（税込）

お支払い: ${checkoutUrl}
※開催日の3日前までにお支払いください。

パークテックイーストジャパン`.trim(),
  });
}

export async function sendOfferApplicantUnavailableMail(params: {
  to: string;
  name: string;
  placeName: string;
  date: string;
}) {
  const { to, name, placeName, date } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】${safe(date)} のご利用について`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>今回はご案内できませんでした</h2>
        <p>${safe(name)} 様</p>
        <p>${safe(date)} の ${safe(placeName)} につきまして、申し訳ございませんが今回は当該区画をご案内できないこととなりました。<strong>料金は発生しておりません。</strong></p>
        <p>また別の機会のご利用をお待ちしております。</p>
        <hr style="margin:24px 0" /><p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `今回はご案内できませんでした。
${safe(name)} 様

${safe(date)} の ${safe(placeName)} は今回ご案内できないこととなりました。料金は発生しておりません。

パークテックイーストジャパン`.trim(),
  });
}

export async function sendOfferTenantChargeFailedMail(params: {
  to: string;
  tenantName: string;
  placeName: string;
  spotLabel: string;
  date: string;
  priceYen: number;
  checkoutUrl: string;
}) {
  const { to, tenantName, placeName, spotLabel, date, priceYen, checkoutUrl } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】自動決済に失敗しました。お支払いのお願い（${safe(date)}）`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>お支払いのお願い</h2>
        <p>${safe(tenantName)} 様</p>
        <p>${safe(date)} のイベント開催日に「利用する」をお選びいただきありがとうございます。<br />
        ご登録カードでの自動決済ができませんでした。お手数ですが、下記より<strong>開催日の3日前まで</strong>にお支払いをお願いします。</p>
        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>金額:</strong> ${safe(priceYen)} 円（税込）</div>
        </div>
        <p style="margin-top:24px;text-align:center">
          <a href="${checkoutUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 28px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">お支払いへ進む</a>
        </p>
        <p style="font-size:12px;color:#666">${checkoutUrl}</p>
        <p style="font-size:13px;color:#555">※3日前までにお支払いがない場合、当日の区画は利用希望者にお譲りする場合があります。</p>
        <hr style="margin:24px 0" /><p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `お支払いのお願い
${safe(tenantName)} 様

${safe(date)} の自動決済ができませんでした。開催日3日前までに下記からお支払いください。
駐車場: ${safe(placeName)} / 区画: ${safe(spotLabel)} / 利用日: ${safe(date)} / 金額: ${safe(priceYen)} 円（税込）

お支払い: ${checkoutUrl}

パークテックイーストジャパン`.trim(),
  });
}

export async function sendMonthlyOfferSelfUseNoticeMail(params: {
  to: string;
  tenantName: string;
  placeName: string;
  spotLabel: string;
  date: string;
}) {
  const { to, tenantName, placeName, spotLabel, date } = params;
  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: `【ParkTec】${safe(date)} は区画をそのままご利用いただけます`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>そのままご利用いただけます</h2>
        <p>${safe(tenantName)} 様</p>
        <p>${safe(date)} のイベント開催日について、${safe(placeName)} のご利用区画（${safe(spotLabel)}）は、
        他のお客様からのご利用希望がなく、<strong>当日そのままご利用いただけます</strong>。</p>
        <p>ご予約手続きは不要です。当日はご登録の区画をご利用ください。</p>
        <hr style="margin:24px 0" /><p>パークテックイーストジャパン</p>
      </div>
    `,
    text: `そのままご利用いただけます。
${safe(tenantName)} 様

${safe(date)} の ${safe(placeName)}（${safe(spotLabel)}）は、当日そのままご利用いただけます。ご予約手続きは不要です。

パークテックイーストジャパン`.trim(),
  });
}

export async function sendUnexitNoticeMail(params: {
  to: string;
  placeName: string;
  spotLabel: string;
  useDate: string;
  leftUrl: string;
  parkedUrl: string;
}) {
  const { to, placeName, spotLabel, useDate, leftUrl, parkedUrl } = params;
  const text = `
ParkTecをご利用いただきありがとうございます。

ご予約の駐車場について、出庫手続き（QRの読み取り）が確認できておりません。
お手数ですが、下記からお知らせください。

■ 駐車場: ${placeName}
■ 区画: ${spotLabel}
■ ご利用日: ${useDate}

すでに出庫された場合:
${leftUrl}

まだ駐車中の場合:
${parkedUrl}

※ すでに出庫済みでお心当たりがない場合はこのメールを破棄してください。
ParkTec
`.trim();

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】出庫手続きのご確認",
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>出庫手続きのご確認</h2>
        <p>ParkTecをご利用いただきありがとうございます。<br />
        ご予約の駐車場について、出庫手続き（QRの読み取り）が確認できておりません。</p>
        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>駐車場:</strong> ${safe(placeName)}</div>
          <div><strong>区画:</strong> ${safe(spotLabel)}</div>
          <div><strong>ご利用日:</strong> ${safe(useDate)}</div>
        </div>
        <p style="margin-top:20px">お手数ですが、下記のいずれかをお選びください。</p>
        <div style="margin:16px 0">
          <a href="${leftUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:12px 20px;background:#0a7d32;color:#fff;border-radius:8px;text-decoration:none;margin-right:8px">
            すでに出庫しました
          </a>
          <a href="${parkedUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:12px 20px;background:#b45309;color:#fff;border-radius:8px;text-decoration:none">
            まだ駐車中です
          </a>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#666">
          ※ すでに出庫済みでお心当たりがない場合はこのメールを破棄してください。
        </p>
        <hr style="margin:24px 0" />
        <p>ParkTec</p>
      </div>
    `,
  });
}

export async function sendDoubleBookingRefundMail(params: {
  to: string;
  name: string;
  date: string;
  slot: string;
  refundAmount: number;
  reserveUrl: string;
}) {
  const { to, name, date, slot, refundAmount, reserveUrl } = params;

  return getResend().emails.send({
    from: MAIL_FROM,
    to,
    subject: "【ParkTec】ご予約について（満車のため成立せず・全額返金のお知らせ）",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>ご予約について、お詫びとご連絡</h2>
        <p>${safe(name)} 様</p>
        <p>
          このたびは ParkTec をご利用いただきありがとうございます。<br />
          大変申し訳ございませんが、ほぼ同時刻に他のお客様のご予約が成立したため、
          ご希望の区画が満車となり、今回のご予約は成立いたしませんでした。
        </p>

        <div style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <div><strong>利用日:</strong> ${safe(date)}</div>
          <div><strong>ご希望区画:</strong> ${safe(slot)}</div>
        </div>

        <div style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fff">
          <div><strong>ご返金:</strong> ${safe(refundAmount)} 円（全額）を自動で返金いたしました。</div>
          <p style="margin:8px 0 0;font-size:12px;color:#666">
            ※ カード会社への反映まで数日かかることがあります。二重にご請求されることはございません。
          </p>
        </div>

        <p style="margin-top:20px">
          他の区画に空きがある場合は、下記より再度ご予約いただけます。<br />
          また、空き状況によっては担当者より別区画をご案内できる場合がございますので、
          その際はこちらからご連絡いたします。
        </p>
        <p>
          <a href="${safe(reserveUrl)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">
            空き状況を確認して再予約する
          </a>
        </p>

        <p style="margin-top:16px">
          ご不便をおかけし誠に申し訳ございません。ご不明な点がございましたら、本メールにご返信ください。
        </p>

        <hr style="margin:24px 0" />
        <p>ParkTec（パークテックイーストジャパン）</p>
      </div>
    `,
    text: `
${safe(name)} 様

このたびは ParkTec をご利用いただきありがとうございます。
大変申し訳ございませんが、ほぼ同時刻に他のお客様のご予約が成立したため、
ご希望の区画が満車となり、今回のご予約は成立いたしませんでした。

利用日: ${safe(date)}
ご希望区画: ${safe(slot)}

ご返金: ${safe(refundAmount)} 円（全額）を自動で返金いたしました。
※ カード会社への反映まで数日かかることがあります。二重にご請求されることはございません。

他の区画に空きがある場合は、下記より再度ご予約いただけます。
また、空き状況によっては担当者より別区画をご案内できる場合がございます。

空き状況を確認して再予約する: ${reserveUrl}

ご不便をおかけし誠に申し訳ございません。ご不明な点がございましたら、本メールにご返信ください。

ParkTec（パークテックイーストジャパン）
    `.trim(),
  });
}
