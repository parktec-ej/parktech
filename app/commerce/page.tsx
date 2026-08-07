export const metadata = {
  title: "特定商取引法に基づく表記 | ParkTec",
  description: "ParkTecの特定商取引法に基づく表記",
};

export default function CommercePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">特定商取引法に基づく表記</h1>

      <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200">
        <dl className="divide-y divide-gray-200 text-sm">
          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">販売事業者</dt>
            <dd className="md:col-span-2">ParkTec</dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">運営責任者</dt>
            <dd className="md:col-span-2">阿部 龍昇</dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">所在地</dt>
            <dd className="md:col-span-2">宮城県塩竈市石堂 3-7</dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">電話番号</dt>
            <dd className="md:col-span-2">
              050-1793-4785
              <br />
              <span className="text-xs text-gray-500">
                受付時間: 平日 9:00〜18:00（土日祝休業）
              </span>
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">メールアドレス</dt>
            <dd className="md:col-span-2">info@parktec-ej.com</dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">販売価格</dt>
            <dd className="md:col-span-2">
              各予約ページまたは各サービス案内ページに表示された金額
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">商品代金以外の必要料金</dt>
            <dd className="md:col-span-2">
              インターネット接続にかかる通信料等は利用者の負担となります。
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">支払方法</dt>
            <dd className="md:col-span-2">クレジットカード等のオンライン決済</dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">支払時期</dt>
            <dd className="md:col-span-2">
              予約サービスは予約確定時、時間貸しサービスは入庫時および延長時に、
              いずれも前払いでお支払いいただきます。
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">役務の提供時期</dt>
            <dd className="md:col-span-2">
              予約または申込みにより指定された利用日時に提供します。
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">キャンセル・返金</dt>
            <dd className="md:col-span-2">
              <p className="font-semibold">予約サービス</p>
              <p className="mt-1">
                利用日の48時間前までにキャンセルされた場合、キャンセル手数料320円を
                差し引いた金額を返金します。利用日の48時間前を過ぎた場合、
                キャンセルはできず、返金も行いません。
                無断不使用（ノーショー）の場合も返金いたしかねます。
              </p>
              <p className="mt-3 font-semibold">時間貸しサービス</p>
              <p className="mt-1">
                時間貸しのご利用は前払いです。ご出庫が出庫期限より早まった場合でも、
                支払済み料金の払い戻しは行いません。延長された場合の追加料金についても
                同様です。
              </p>
              <p className="mt-3">
                当社都合により利用いただけない場合は、いずれのサービスも全額返金します。
                詳細はキャンセルポリシーおよび利用規約をご確認ください。
              </p>
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">動作環境</dt>
            <dd className="md:col-span-2">
              インターネット接続可能なスマートフォン、タブレット、またはPC
            </dd>
          </div>
        </dl>
      </div>
    </main>
  );
}