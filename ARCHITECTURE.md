# Markdown Twin アーキテクチャ

Markdown Twin は、軽量なヘキサゴナルアーキテクチャと一方向データフローを採用する。
翻訳処理はドキュメント単位のセッションとして管理し、VS Code UI、Webview、設定、翻訳APIを外部アダプターとして扱う。

## 依存方向

```text
VS Code Commands / Events
          |
          v
VS Code TranslationCoordinator
          |
          v
Application TranslationCoordinator
          |
          +--> TranslationExecutor + DocumentTranslationSession
          +--> TranslationStore + TranslationCache Port
          +--> Domain (TranslationSpec / TranslationStatus / Markdown変換)
          +--> Ports  (Settings / Status / Diagnostics / Preview targets / Provider)

Adapters --> Ports
```

内側のモジュールから具体的なUI実装を参照してはならない。

- Domain、Ports、Applicationは`vscode`パッケージを参照しない。
- 翻訳実行コードは `PreviewPanel` を参照しない。
- `PreviewPanel` と `ProviderSelector` は翻訳状態を直接変更せず、`TranslationCoordinator`を呼ぶ。
- VS Code設定は `TranslationSettingsRepository` を通じて読み書きする。
- 翻訳APIは `TranslationProvider` Portを実装し、VS Code UIを参照しない。
- Markdown変換コアは `vscode` パッケージを参照しない。

## 主要コンポーネント

### VS Code TranslationCoordinator

VS Codeの`TextDocument`と`Uri`を内側の`TranslationDocument`と文書IDへ変換するアダプター。キャッシュ無効化、単一文書の実行、全プレビュー文書の再実行、デバウンス、Context keyを調整する。

### Application TranslationCoordinator

VS Code APIに依存しない翻訳ユースケース。翻訳条件、文書状態、キャッシュと実行結果を調整し、外部機能にはPortを通じてアクセスする。旧`TranslationManager`は廃止済み。

### TranslationExecutor

Providerのバッチ呼び出し、返却件数検証、世代確認後のコミットを担当する。古い実行、キャンセル済み実行、件数不一致の結果はコミットしない。

### TranslationStore

文書ごとの`enabled`状態と`idle / running / completed / partial / failed / cancelled`実行状態を分離して保持する。

### DocumentTranslationSession

ドキュメントごとの非同期実行世代と`AbortSignal`を所有する。新しい実行を始めると古い実行を中断し、古いレスポンスがキャッシュへコミットされることを防ぐ。

### TranslationSpec

翻訳結果を決定する設定のスナップショット。Provider、ソース言語、ターゲット言語、Provider固有設定をキャッシュキーへ含める。

### PreviewRegistry

Previewパネルの生成、検索、アクティブ選択、破棄を所有する。`PreviewController`がVS Codeイベントを一度だけ購読し、`PreviewPanel`自身はWebview表示、メッセージ処理、スクロール同期に集中する。

### ProviderRegistry

利用可能なProviderのメタデータと生成処理を一元管理する。Provider追加時は、原則としてこのレジストリとProvider実装を追加する。

## 翻訳フロー

```text
Command / Configuration Event
  -> VS Code TranslationCoordinator
  -> Application TranslationCoordinator
  -> DocumentTranslationSession.begin()
  -> TranslationExecutor
  -> Markdownから翻訳単位を抽出
  -> TranslationProvider.translate(..., AbortSignal)
  -> セッション世代を確認
  -> TranslationSpec単位のキャッシュへコミット
  -> 状態イベント
  -> Preview / StatusBarを更新
```

## 不変条件

1. 同じドキュメントの新しい翻訳は、古い翻訳を無効化する。
2. 無効化されたセッションは結果をキャッシュへ書き込めない。
3. 失敗した原文を翻訳済み結果としてキャッシュしない。
4. グローバル設定変更は、開いている全対象ドキュメントへ反映する。
5. キャッシュは翻訳条件が異なる結果を共有しない。
6. Previewの一覧とアクティブ状態は`PreviewRegistry`だけが所有する。
7. Providerレスポンス数が入力数と一致しない場合、結果をコミットしない。
8. VS Code設定へ直接アクセスするのは`VscodeTranslationSettingsRepository`だけとする。

## 変更時の配置指針

- Markdownの解析・生成規則: ドメイン側の純粋なモジュール
- 翻訳の実行、状態、取消、コミット: `application/`
- VS Code文書とコマンドの調整: VS Codeアダプター
- 外部実装へ要求する契約: `ports/`
- VS Code API、Webview、設定、SecretStorage: VS Codeアダプター
- 翻訳サービス固有のHTTP処理: `adapters/providers/`

境界を越えて便利な静的状態を追加せず、必要な依存はコンストラクターで注入する。

## Provider実行ポリシー

- Provider呼び出しは共有ゲートで同時実行数を制限する。
- 1回の呼び出しは30秒でタイムアウトする。
- 429は`Retry-After`を優先し、未指定時は指数バックオフで最大2回再試行する。
- セッションの`AbortSignal`は待機、再試行、HTTPリクエストのすべてへ伝播する。
- 成功したバッチだけをコミットし、一部のみ成功した場合は`partial`状態を使用する。

## Webview境界

- 拡張本体とWebviewの通信型は`src/webview/protocol.ts`へ集約する。
- 受信メッセージは型ガードで検証してから処理する。
- Webviewは`src/webview/runtimeEntry.ts`から`dist/webview.js`へ別バンドルする。
- 初期表示データは実行可能なインラインコードへ埋め込まず、JSONとして渡す。
