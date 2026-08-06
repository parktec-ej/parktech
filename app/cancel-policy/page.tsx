export const metadata = {
  title: "キャンセルポリシー | ParkTec",
  description: "ParkTecのキャンセル・日付変更・返金に関するポリシー",
};

export default function CancelPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">キャンセルポリシー</h1>
      <p className="mt-2 text-xs text-gray-400">最終更新日: 2026年8月6日</p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-gray-800">
        <p>
          ParkTecをご利用いただきありがとうございます。
          ご予約のキャンセル・日付変更・返金、および時間貸しご利用時の
          取扱いについて、以下のとおり定めます。
        </p>

        <section>
          <h2 className="text-xl font-semibold">1. 予約キャンセル</h2>
          <p className="mt-3">
            キャンセル料は、キャンセルのタイミングにより以下のとおり異なります。
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-semibold">タイミング</th>
                <th className="py-2 text-left font-semibold">対応</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3 pr-4">利用日の48時間前まで</td>
                <td className="py-3">
                  <strong>キャンセル手数料 320円</strong>
                  <br />
                  <span className="text-xs text-gray-500">残額を返金</span>
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4">利用日の48時間以内</td>
                <td className="py-3">
                  <strong>キャンセル不可</strong>
                  <br />
                  <span className="text-xs text-gray-500">全額請求（返金なし）</span>
                </td>
              </tr>
            </tbody>
          </table>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>
              利用開始後、および無断不使用（ノーショー）の場合は、
              <strong>返金いたしかねます</strong>。
            </li>
            <li>
              キャンセルはご予約完了メールに記載のキャンセルURLからお手続きいただけます。
            </li>
            <li>
              URLからのお手続きが難しい場合は{" "}
              <a href="mailto:info@parktec-ej.com" className="text-blue-600 underline">
                info@parktec-ej.com
              </a>{" "}
              までご連絡ください。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. 予約日の変更</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>予約受付から24時間以内</strong>に限り、
              <strong>1回まで無料</strong>で利用日を変更できます。
            </li>
            <li>変更先の日付に空きがある場合のみ変更可能です。</li>
            <li>24時間を過ぎた場合、または既に1回変更済みの場合は変更できません。</li>
            <li>
              利用日の48時間前を過ぎている場合は、変更期限内であっても
              利用日を変更することはできません。
            </li>
            <li>変更はキャンセルURLの予約管理ページからお手続きいただけます。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. イベント日・繁忙日</h2>
          <p className="mt-3">
            イベント日・特別料金日など、一部予約について通常と異なる条件を設定する場合があります。
            その場合は、予約ページに記載された条件を優先します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            4. 時間貸しご利用時の取扱い
          </h2>
          <p className="mt-3">
            時間貸しのご利用は前払いです。入庫時に駐車時間をお選びいただき、
            その時間に対応する料金をお支払いいただきます。
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              出庫期限より早くご出庫された場合でも、支払済み料金の払い戻しは
              行いません。
            </li>
            <li>
              延長された場合の追加料金についても、同様に払い戻しは行いません。
            </li>
            <li>
              出庫期限を超えて駐車を継続された場合、超過した時間に対応する
              時間貸し料金を申し受けます。
            </li>
            <li>
              後続のご予約がある区画において、当該予約日の午前0時を超えて
              駐車が継続された場合、上記に加えて予約者への返金相当額および
              対応費用5,000円を申し受けます（利用規約 第6条の2）。
            </li>
          </ul>
          <p className="mt-3">
            出庫期限は入庫時および延長時に画面へ表示されます。
            期限が近づいた場合は、お早めにご出庫または延長のお手続きをお願いします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            5. 予約利用の出庫期限
          </h2>
          <p className="mt-3">
            ご予約でのご利用は、予約日の翌日午前0時が出庫期限です。
          </p>
          <p className="mt-3">
            出庫期限を超えて駐車が継続された場合、延滞料金（超過日数分の1日料金）、
            後続の予約者への返金相当額、および対応費用5,000円を申し受けます
            （利用規約 第6条の3）。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. 当社都合による返金</h2>
          <p className="mt-3">
            設備不具合、重複予約、災害等によりご利用いただけない場合は、
            <strong>全額返金</strong>いたします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. 不可抗力によるキャンセル</h2>
          <p className="mt-3">
            台風、地震、降雪、感染症の流行、警察・行政の指示、その他の不可抗力により
            駐車場をご利用いただけない場合は、お客様・当社双方の協議のうえ、
            個別にご返金等を判断いたします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. 返金方法</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>返金は原則としてご決済時と同じ決済手段への返金となります。</li>
            <li>
              カード会社への反映まで数営業日（最大2週間程度）を要する場合があります。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. お問い合わせ</h2>
          <p className="mt-3">
            キャンセルおよび返金に関するお問い合わせは{" "}
            <a href="mailto:info@parktec-ej.com" className="text-blue-600 underline">
              info@parktec-ej.com
            </a>{" "}
            までご連絡ください。
          </p>
        </section>
      </div>
    </main>
  );
}
