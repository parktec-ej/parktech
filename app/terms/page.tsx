export const metadata = {
  title: "利用規約 | ParkTec",
  description: "ParkTecの利用規約",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">利用規約</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-gray-800">
        <p>
          この利用規約（以下「本規約」）は、ParkTec（以下「当サービス」）が提供する
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
              利用日の48時間前までにキャンセルされた場合、キャンセル手数料320円を
              差し引いた金額を返金します。
            </li>
            <li>
              利用日の48時間前を過ぎた場合、キャンセルはできません。利用料金の返金は
              行いません。
            </li>
            <li>
              利用日の変更は、決済完了から24時間以内に限り、1回まで無料で行えます。
              ただし、利用日の48時間前を過ぎている場合は変更できません。
            </li>
            <li>
              無断不使用（ノーショー）の場合、返金は行いません。
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
          <h2 className="text-xl font-semibold">
            第6条の2（時間貸し利用の料金、延長および出庫期限）
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              時間貸しのご利用は前払いとします。利用者は、入庫時に駐車時間を
              選択し、当該時間に対応する料金を支払うものとします。
            </li>
            <li>
              前号の支払いにより、利用者が選択した時間の終了時刻を出庫期限と
              します。当社は入庫時に出庫期限を表示します。
            </li>
            <li>利用者は、出庫期限までに出庫するものとします。</li>
            <li>
              利用者は、出庫期限までの間に限り、駐車時間を延長することができます。
              延長は当社所定の画面から行い、追加の時間に対応する料金を前払いする
              ものとします。延長後の出庫期限は、延長前の出庫期限に延長した時間を
              加えた時刻とします。
            </li>
            <li>
              当該区画に後続のご予約がある場合、出庫期限および延長可能な範囲は、
              当該予約日の午前0時までに制限されます。この場合、当社は入庫時に
              その旨を表示します。
            </li>
            <li>
              前号の予約がない場合であっても、当社が定める最大駐車日数を超える
              延長はできません。
            </li>
            <li>
              出庫期限より前に出庫された場合であっても、支払済みの料金の
              払い戻しは行いません。
            </li>
            <li>
              利用者が出庫期限を超えて駐車を継続した場合、当社は利用者に対し、
              超過した時間に対応する時間貸し料金を請求することができます。
            </li>
            <li>
              前号の場合において、第5号の予約日の午前0時を超えて駐車が継続された
              ときは、当社は前号の料金に加え、次の各号の合計額を請求することが
              できます。
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>当社が当該予約者に返金した場合、その返金額に相当する額</li>
                <li>対応費用として5,000円</li>
              </ul>
            </li>
            <li>
              前号の対応費用は、同号の期限が常に深夜0時であり、当社が当該時間帯
              において利用者への連絡および現地対応を行える体制を維持する必要が
              あることに鑑み、その体制維持に要する費用に基づき定めたものです。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            第6条の3（予約利用における出庫期限および超過時の取扱い）
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>予約利用の出庫期限は、予約日の翌日午前0時とします。</li>
            <li>
              利用者が前号の出庫期限を超えて駐車を継続した場合、当社は利用者に
              対し、次の各号の合計額を請求することができます。
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  延滞料金として、超過した日数（1日に満たない端数は1日として
                  計算します）に当該駐車場の1日分の利用料金を乗じた額
                </li>
                <li>
                  当社が後続の予約者に返金した場合、その返金額に相当する額
                </li>
                <li>対応費用として5,000円</li>
              </ul>
            </li>
            <li>
              前号の対応費用は、同号の出庫期限が常に深夜0時であり、当社が当該
              時間帯において利用者への連絡および現地対応を行える体制を維持する
              必要があることに鑑み、その体制維持に要する費用に基づき定めたもの
              です。
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