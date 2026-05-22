export const metadata = {
  title: "キャンセルポリシー | ParkTec",
  description: "ParkTecのキャンセルポリシー",
};

export default function CancelPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">キャンセルポリシー</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-gray-800">
        <p>
          ParkTecをご利用いただきありがとうございます。
          ご予約のキャンセルおよび返金について、以下のとおり定めます。
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
                <th className="py-2 text-left font-semibold">キャンセル料</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3 pr-4">予約から48時間以内<br /><span className="text-xs text-gray-500">（かつ利用日2日前より前の場合）</span></td>
                <td className="py-3"><strong>手数料300円のみ</strong><br /><span className="text-xs text-gray-500">残額を返金</span></td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4">利用日の2日前〜前日</td>
                <td className="py-3"><strong>利用料金の50%</strong><br /><span className="text-xs text-gray-500">＋返金事務手数料300円</span></td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4">利用日当日</td>
                <td className="py-3"><strong>利用料金の100%</strong><br /><span className="text-xs text-gray-500">返金なし</span></td>
              </tr>
            </tbody>
          </table>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>
              利用開始後、および無断不使用（ノーショー）の場合は、
              <strong>返金いたしかねます</strong>。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. イベント日・繁忙日</h2>
          <p className="mt-3">
            イベント日・特別料金日など、一部予約について通常と異なる条件を設定する場合があります。
            その場合は、予約ページに記載された条件を優先します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. 当社都合による返金</h2>
          <p className="mt-3">
            設備不具合、重複予約、災害等によりご利用いただけない場合は、
            <strong>全額返金</strong>いたします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. 返金方法</h2>
          <p className="mt-3">
            返金は、ご利用時の決済方法（クレジットカード等）へ行います。
            返金時期はカード会社・決済会社の処理スケジュールによります。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. お問い合わせ</h2>
          <p className="mt-3">
            キャンセルおよび返金に関するお問い合わせは、当サービスのお問い合わせ窓口までご連絡ください。
          </p>
        </section>
      </div>
    </main>
  );
}