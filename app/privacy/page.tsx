export const metadata = {
  title: "プライバシーポリシー | ParkTec",
  description: "ParkTecのプライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">プライバシーポリシー</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-gray-800">
        <p>
          ParkTech（以下「当サービス」）は、利用者の個人情報の重要性を認識し、
          個人情報の保護に関する法令等を遵守するとともに、以下の方針に基づき適切に取り扱います。
        </p>

        <section>
          <h2 className="text-xl font-semibold">1. 取得する情報</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>氏名</li>
            <li>メールアドレス</li>
            <li>電話番号</li>
            <li>車両ナンバー</li>
            <li>予約内容、利用履歴</li>
            <li>決済に関する情報（決済代行会社を通じて処理される情報を含みます）</li>
            <li>IPアドレス、Cookie、アクセスログ等の技術情報</li>
            <li>お問い合わせ内容</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. 利用目的</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>予約受付、本人確認、入出庫管理のため</li>
            <li>決済処理、返金対応、領収書発行のため</li>
            <li>お問い合わせ対応のため</li>
            <li>不正利用防止、安全管理のため</li>
            <li>サービス改善、品質向上のため</li>
            <li>法令対応のため</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. 第三者提供</h2>
          <p className="mt-3">
            当サービスは、法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. 外部事業者の利用</h2>
          <p className="mt-3">
            当サービスは、サービス運営のため外部事業者を利用することがあります。
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Stripe（決済処理）</li>
            <li>Vercel（ホスティング）</li>
            <li>Supabase（データベース等）</li>
            <li>Resend（メール送信）</li>
          </ul>
          <p className="mt-3">
            これらの事業者に対しては、業務遂行に必要な範囲で情報を提供する場合があります。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. 安全管理</h2>
          <p className="mt-3">
            当サービスは、個人情報の漏えい、滅失、毀損等を防止するため、
            必要かつ合理的な安全管理措置を講じます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. 保管期間</h2>
          <p className="mt-3">
            個人情報は、利用目的の達成に必要な期間保管し、不要となった後は適切な方法で削除または廃棄します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. 開示・訂正・削除等</h2>
          <p className="mt-3">
            本人から自己の個人情報について開示、訂正、利用停止、削除等の請求があった場合、
            法令に従い適切に対応します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Cookie等の利用</h2>
          <p className="mt-3">
            当サービスは、利便性向上や利用状況把握のため、Cookieその他これに類する技術を利用する場合があります。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. 改定</h2>
          <p className="mt-3">
            本ポリシーは、必要に応じて改定されることがあります。重要な変更がある場合は、
            当サービス上で適切に告知します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. お問い合わせ</h2>
          <p className="mt-3">
            個人情報の取り扱いに関するお問い合わせは、当サービスのお問い合わせ窓口までご連絡ください。
          </p>
        </section>
      </div>
    </main>
  );
}