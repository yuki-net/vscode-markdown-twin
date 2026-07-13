# Markdown Twin アーキテクチャ

Markdown Twin は、軽量なヘキサゴナルアーキテクチャと一方向データフローを採用する。
翻訳処理はドキュメント単位のセッションとして管理し、VS Code UI、Webview、設定、翻訳APIを外部アダプターとして扱う。

## 依存方向

```text
VS Code Commands / Events
          |
          v
TranslationCoordinator
          |
          v
TranslationManager + DocumentTranslationSession
          |
          +--> Domain (TranslationSpec / Markdown変換)
          +--> Ports  (Settings / Status / Preview targets)
          +--> TranslationProvider

Adapters --> Ports
```

内側のモジュールから具体的なUI実装を参照してはならない。

- 翻訳実行コードは `PreviewPanel` を参照しない。
- `PreviewPanel` と `ProviderSelector` は翻訳状態を直接変更せず、`TranslationCoordinator`を呼ぶ。
- VS Code設定は `TranslationSettingsRepository` を通じて読み書きする。
- 翻訳APIは `ITranslationProvider` を実装し、VS Code UIを参照しない。
- Markdown変換コアは `vscode` パッケージを参照しない。

## 主要コンポーネント

### TranslationCoordinator

翻訳操作のアプリケーション向け窓口。キャッシュ無効化、単一文書の実行、全プレビュー文書の再実行、UI向け状態イベントを調整する。

### DocumentTranslationSession

ドキュメントごとの非同期実行世代と`AbortSignal`を所有する。新しい実行を始めると古い実行を中断し、古いレスポンスがキャッシュへコミットされることを防ぐ。

### TranslationSpec

翻訳結果を決定する設定のスナップショット。Provider、ソース言語、ターゲット言語、Provider固有設定をキャッシュキーへ含める。

### PreviewRegistry

Previewパネルの生成、検索、アクティブ選択、破棄を所有する。`PreviewPanel`自身はWebview表示、メッセージ処理、スクロール同期に集中する。

### ProviderRegistry

利用可能なProviderのメタデータと生成処理を一元管理する。Provider追加時は、原則としてこのレジストリとProvider実装を追加する。

## 翻訳フロー

```text
Command / Configuration Event
  -> TranslationCoordinator
  -> DocumentTranslationSession.begin()
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

## 変更時の配置指針

- Markdownの解析・生成規則: ドメイン側の純粋なモジュール
- 翻訳の開始、取消、再試行、全体調整: `application/`
- 外部実装へ要求する契約: `ports/`
- VS Code API、Webview、設定、SecretStorage: VS Codeアダプター
- 翻訳サービス固有のHTTP処理: `providers/`

境界を越えて便利な静的状態を追加せず、必要な依存はコンストラクターで注入する。
