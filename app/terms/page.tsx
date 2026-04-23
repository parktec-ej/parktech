export const metadata = {
  title: "利用規約 | ParkTech",
  description: "ParkTechの利用規約",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">利用規約</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-gray-800">
        <p>
          この利用規約（以下「本規約」）は、ParkTech（以下「当サービス」）が提供する
          駐車場予約・時間貸しサービスの利用条件を定めるものです。
          利用者は、本規約に同意のうえ当サービスを利用するものとします。
        </p>

        <section>
          <h2 className="text-xl font-semibold">第1条（適用）</h2>
          <p className="mt-3">
            本規約は、利用者と当サービスとの間の一切の関係に適用されます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第2条（サービス内容）</h2>
          <p className="mt-3">当サービスは、以下の機能を提供します。</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>駐車場予約サービス</li>
            <li>時間貸し駐車サービス</li>
            <li>QRコード等を利用した入出庫管理</li>
            <li>オンライン決済</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第3条（利用者情報の入力）</h2>
          <p className="mt-3">
            利用者は、氏名、車両ナンバー、連絡先その他当サービスが求める情報を、
            真実かつ正確に入力するものとします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第4条（予約成立）</h2>
          <p className="mt-3">
            利用者による予約申込みに対し、当サービス所定の決済手続が完了した時点で予約が成立します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第5条（利用料金および支払方法）</h2>
          <p className="mt-3">
            利用料金は、予約画面または料金表示画面に記載された金額とし、
            当サービス所定の方法により支払うものとします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第6条（キャンセルおよび返金）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              予約完了後から利用開始前までのキャンセルについては、利用料金の50%を返金します。
              なお、返金事務手数料300円を差し引きます。
            </li>
            <li>
              利用開始後、および無断不使用（ノーショー）の場合、返金は行いません。
            </li>
            <li>
              当サービス都合によりサービス提供ができない場合は、全額返金します。
            </li>
            <li>
              イベント日・繁忙日等について特別条件が表示されている場合、
              当該表示内容を優先します。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第7条（禁止事項）</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>虚偽情報による予約または登録</li>
            <li>無断駐車、不正利用、第三者への予約譲渡</li>
            <li>設備、備品、コーン、看板等の破損、汚損、持ち去り</li>
            <li>他の利用者、近隣住民、管理者への迷惑行為</li>
            <li>法令または公序良俗に反する行為</li>
            <li>当サービスの運営を妨害する行為</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第8条（利用者の責任）</h2>
          <p className="mt-3">
            利用者は、現地の案内、駐車枠、利用時間、注意事項を遵守し、
            安全に駐車場を利用するものとします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第9条（免責）</h2>
          <p className="mt-3">
            当サービスは、当サービスに故意または重大な過失がある場合を除き、
            駐車場内における盗難、事故、破損、利用者間トラブル、天災、通信障害、
            第三者行為等によって生じた損害について責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第10条（損害賠償）</h2>
          <p className="mt-3">
            利用者が本規約に違反し、または設備等を破損し、もしくは当サービスに損害を与えた場合、
            当サービスは当該利用者に対し、その損害の賠償を請求できるものとします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第11条（サービス内容の変更・停止）</h2>
          <p className="mt-3">
            当サービスは、保守、障害対応、法令対応その他必要がある場合、
            事前通知なくサービス内容を変更し、または提供を停止することがあります。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第12条（準拠法・管轄）</h2>
          <p className="mt-3">
            本規約は日本法に準拠し、本サービスに関して紛争が生じた場合には、
            当サービス運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>
      </div>
    </main>
  );
}