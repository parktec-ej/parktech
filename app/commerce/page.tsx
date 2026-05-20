export const metadata = {
  title: "特定商取引法に基づく表記 | ParkTech",
  description: "ParkTechの特定商取引法に基づく表記",
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
            <dd className="md:col-span-2">
              請求があった場合、遅滞なく開示いたします。
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">電話番号</dt>
            <dd className="md:col-span-2">
              請求があった場合、遅滞なく開示いたします。
            </dd>
          </div>

          <div className="grid gap-2 px-4 py-4 md:grid-cols-3">
            <dt className="font-semibold text-gray-900">メールアドレス</dt>
            <dd className="md:col-span-2">support@parktec-ej.com</dd>
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
            <dd className="md:col-span-2">予約確定時または当サービス所定の時点</dd>
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
              予約完了後から利用開始前までのキャンセルは50%返金とし、
              返金事務手数料300円を差し引きます。
              利用開始後および無断不使用の場合は返金いたしかねます。
              当社都合による利用不能の場合は全額返金します。
              詳細はキャンセルポリシーをご確認ください。
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