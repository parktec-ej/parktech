export const metadata = {
  title: "月極駐車場 利用規約 | ParkTec",
  description: "パークテックイーストジャパンの月極駐車場 利用規約",
};

export default function MonthlyTermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">月極駐車場 利用規約</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-gray-800">
        <p>
          この月極駐車場利用規約（以下「本規約」）は、パークテックイーストジャパン（以下「当社」）が提供する月極駐車場サービス（以下「本サービス」）の利用条件を定めるものです。契約者は、本規約に同意のうえ本サービスを利用するものとします。
        </p>
        <p>
          なお、本サービスに関して本規約に定めのない事項については、当社の「利用規約」の定めを準用します。
        </p>

        <section>
          <h2 className="text-xl font-semibold">第1条（契約の成立）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>契約者による申込みに対し、当社が審査のうえ承認し、当社所定の決済手続が完了した時点で契約が成立します。</li>
            <li>当社は、申込内容に不備がある場合その他相当の理由がある場合、申込みを承認しないことがあります。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第2条（利用区画）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>契約者は、契約時に指定された1区画を専有して利用できます。</li>
            <li>1区画につき1契約とします。</li>
            <li>契約者は、当社の承諾なく、契約上の地位または利用する権利を第三者に譲渡し、転貸してはなりません。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第3条（利用料金および支払方法）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>利用料金は月額［3,300］円（税込）とします。</li>
            <li>支払方法はクレジットカードによる自動決済とし、毎月自動更新されます。</li>
            <li>日割計算は行いません。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第4条（利用時間）</h2>
          <p className="mt-3">
            契約者は、次条に定めるイベント開催日を除き、24時間いつでも利用区画を利用できます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第5条（イベント開催日の取扱い）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              <strong>イベント開催日は、原則として月極区画をご利用いただけません。</strong>
            </li>
            <li>イベント開催日とは、当社が本駐車場の周辺施設における催事等を勘案して指定し、契約者ページに掲示する日をいいます。</li>
            <li>当社は、イベント開催日を指定したとき、契約者に対し電子メールにより通知します。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第6条（イベント開催日の利用予約）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>契約者は、イベント開催日に利用を希望する場合、契約者ページから当該日の予約を行い、当社所定の追加料金を支払うものとします。</li>
            <li>
              <strong>前項の支払いが完了した時点で、当該日の予約が確定します。</strong>
            </li>
            <li>前項の支払いが完了するまでの間、当該区画は一般の予約の対象となります。契約者が手続を行っている間に一般の予約が成立した場合、契約者は当該日に利用することができません。</li>
            <li>前項の場合、当社は契約者に対し、いかなる賠償責任も負いません。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第7条（回答期限および一般開放）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              契約者は、イベント開催日の<strong>14日前</strong>までに、契約者ページから利用の有無を回答するものとします。
            </li>
            <li>
              当社は、回答期限の<strong>3日前</strong>（イベント開催日の17日前）に、回答を促す通知を電子メールにより送信します。
            </li>
            <li>
              次の各号のいずれかに該当する場合、当社は当該日の区画を一般の予約に開放することができます。
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>契約者が「利用しない」と回答したとき</li>
                <li>回答期限までに回答がないとき</li>
                <li>契約者が利用を希望したが、第6条第2項の支払いが完了していないとき</li>
              </ul>
            </li>
            <li>前項により開放された区画は、契約者にお戻しすることはできません。</li>
            <li>当社は、第3項により区画を開放したとき、契約者に対し電子メールにより通知します。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第8条（無断駐車の禁止）</h2>
          <p className="mt-3">
            契約者は、イベント開催日において、第6条に定める予約手続を完了することなく利用区画に駐車してはなりません。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第9条（無断駐車の場合の費用負担）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              契約者が前条に違反して駐車した場合、当社は契約者に対し、次の各号の合計額を請求することができます。
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>当該日における当該区画の一般利用料金に相当する額</li>
                <li>当社が当該区画の予約者に返金した場合、その返金額に相当する額</li>
                <li>対応費用として5,000円</li>
              </ul>
            </li>
            <li>前項第3号の対応費用は、イベント開催日において当該区画が予約済みであった場合、当社が予約者への連絡、現地での対応および代替区画の手配を行う必要があることに鑑み、その体制維持に要する費用に基づき定めたものです。</li>
            <li>本条は違約金を定めるものではなく、当社に現に生じる費用の負担を定めるものです。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第10条（禁止事項）</h2>
          <p className="mt-3">契約者は、次の行為をしてはなりません。</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>契約区画以外の区画への駐車</li>
            <li>前条に定める無断駐車</li>
            <li>車庫証明の取得を目的とした虚偽の申告</li>
            <li>その他、当社の「利用規約」第7条に定める行為</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第11条（解約）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>契約者は、契約者ページからいつでも解約を申し込むことができます。</li>
            <li>当社が解約手続を行った時点で、以降の自動決済を停止します。</li>
            <li>既に支払われた料金の返金は行いません。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第12条（当社からの解約）</h2>
          <p className="mt-3">
            契約者が本規約に違反した場合、当社は催告のうえ、本契約を解除することができます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第13条（本規約の変更）</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>当社は、本規約を変更することがあります。</li>
            <li>契約者に不利益となる変更を行う場合、当社は、変更後の内容および効力発生日を、効力発生日の［　1か月　］前までに電子メールにより通知します。</li>
            <li>契約者は、前項の変更に同意しない場合、効力発生日までに解約を申し込むことができます。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">第14条（準拠法・管轄）</h2>
          <p className="mt-3">
            本規約は日本法に準拠し、本サービスに関して紛争が生じた場合には、当社の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <p className="mt-3">
          制定日：［　　年　　月　　日　］
          <br />
          パークテックイーストジャパン
        </p>
      </div>
    </main>
  );
}
