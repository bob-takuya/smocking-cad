# SmockingCAD — 仕様書 v0.2

**Fabric Tessellation 逆設計 CADツール**  
論文「Fabric Tessellation: Realizing Freeform Surfaces by Smocking」(Segall et al., ACM TOG 2024) に基づく設計支援環境

---

## 1. プロダクトビジョン

### 1.1 概要

SmockingCAD は、スモッキング技法による布のテッセレーションを対象とした**インタラクティブな逆設計CADツール**である。設計者は目標とする3D形状とスモッキングパターンを自由に選択・編集し、2Dの縫い合わせパターン（ステッチパターン）をリアルタイムに生成・評価・修正できる。論文中のすべてのダイアグラム表現（Tangramグラフ、Open/Closed状態、特異点分布、誤差ヒートマップ等）を設計ビューとして常時参照できる環境を提供する。

### 1.2 設計思想

- **論文忠実性**: 論文中の図（Fig.3, 6, 8, 9, 10, 15, 19など）をUIの設計言語として取り込み、概念と操作の乖離をなくす
- **非線形探索**: 正解を一意に求めるのではなく、パラメータ空間を設計者が自由に探索できる
- **即時フィードバック**: 形状変更・パターン変更がTangram最適化と3Dプレビューに即座に反映される
- **製作直結出力**: 最終的にファブリケーション可能なステッチパターン（SVG/PDF）を出力できる

---

## 2. ユーザーペルソナとユースケース

### 2.1 主要ユーザー

| ペルソナ | 職能 | 主なユースケース |
|---|---|---|
| **建築設計者** | 建築家・構造デザイナー | 自由曲面のファブリックフォームワーク設計 |
| **ファッションデザイナー** | パタンナー・テキスタイルアーティスト | 立体ドレス・クチュール向けスモッキングパターン生成 |
| **研究者** | 計算デザイン・ファブリケーション | Tangramパラメータの実験・パターン新規設計 |
| **教育者/学生** | 建築情報学・コンピュテーショナルデザイン | 論文アルゴリズムの視覚的理解と実験 |

### 2.2 コアユースケース

**UC-01 形状先行設計**  
任意の3D目標形状（プリセットまたはインポート）を選択し、最適なスモッキングパターンを自動生成、製作用の2Dステッチパターンとして出力する。

**UC-02 パターン先行設計**  
使用したいスモッキングパターンを先に決め、そのパターンが実現可能な形状空間を探索する。

**UC-03 Tangram解析**  
既存のスモッキングパターンのTangramグラフを視覚化し、パターンが well-constrained かどうかを確認、新規パターンを設計する。

**UC-04 比較・反復探索**  
同一の目標形状に対して複数のスモッキングパターンや最適化パラメータを比較し、最も美しいプリーツが得られる組み合わせを見つける。

---

## 3. システムアーキテクチャ

### 3.1 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                    SmockingCAD UI                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Shape Panel │  │ Pattern Panel│  │  Result Panel │ │
│  │  (3D Viewer) │  │ (2D Editor)  │  │ (3D Preview)  │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │         │
│  ┌──────▼─────────────────▼───────────────────▼───────┐ │
│  │               Core Engine (JavaScript/WASM)         │ │
│  │  ┌──────────────┐  ┌───────────────────────────┐   │ │
│  │  │ Tangram      │  │ Optimization Engine        │   │ │
│  │  │ Computation  │  │ (Eshape + Epleat + Eseam)  │   │ │
│  │  └──────────────┘  └───────────────────────────┘   │ │
│  │  ┌──────────────┐  ┌───────────────────────────┐   │ │
│  │  │ Seamless     │  │ ARAP Preview               │   │ │
│  │  │ Parametriz.  │  │ (As-Rigid-As-Possible)     │   │ │
│  │  └──────────────┘  └───────────────────────────┘   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 技術スタック

| レイヤー | 技術 | 理由 |
|---|---|---|
| UIフレームワーク | React + TypeScript | コンポーネント管理・状態管理 |
| 3D描画 | Three.js | Shape Panel / Result Panel |
| 2D描画 | SVG (d3.js) | Pattern Panel / Tangram視覚化 |
| 数値最適化 | JavaScript実装 (Newton法) | 論文Eq.(1),(5)の実装 |
| 行列演算 | math.js / 独自実装 | 剛体変換・エネルギー勾配計算 |
| エクスポート | SVG/PDF (jsPDF) | ステッチパターン出力 |
| 状態管理 | Zustand | グローバルデザイン状態 |

---

## 4. UI構成 — レイアウト設計

### 4.1 全体レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│  [SmockingCAD]   [File▼] [Edit▼] [View▼] [Export▼]   [?]      │  ← ヘッダーバー
├────────────────┬───────────────────────┬────────────────────────┤
│                │                       │                        │
│  SHAPE PANEL   │   TANGRAM PANEL       │   RESULT PANEL         │
│  (3D Target)   │   (2D Editor)         │   (3D Preview)         │
│                │                       │                        │
│  [Mesh View]   │  [Open] ↔ [Closed]   │  [Smocked Result]      │
│                │  [Tangram Graph]      │  [Heatmap Toggle]      │
│    W:50%       │       W:25%           │       W:25%            │
│                │                       │                        │
├────────────────┴───────────────────────┴────────────────────────┤
│  INSPECTOR PANEL (bottom, collapsible)                          │
│  [Pattern Library] [Optimization] [Singularities] [Analysis]   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 レイアウト変形モード

設計者の作業フェーズに応じてパネル配置を変更できる。

| モード | レイアウト | 用途 |
|---|---|---|
| **Explore** | 3パネル均等 | デフォルト。全情報を俯瞰 |
| **Shape Focus** | Shape 60% / Tangram 20% / Result 20% | 目標形状の精密編集 |
| **Pattern Focus** | Shape 20% / Tangram 60% / Result 20% | Tangramグラフの精密編集 |
| **Result Focus** | Shape 20% / Tangram 20% / Result 60% | 最終プレビューの確認 |
| **Compare** | 2×2グリッド（複数デザインを並列表示） | 案の比較検討 |

---

## 5. Shape Panel 詳細仕様

### 5.1 概要

目標3D曲面を設定・編集するパネル。Three.jsによる3Dビューアで、メッシュの操作とリメッシュ結果を表示する。

### 5.2 形状プリセットライブラリ

論文で示された形状をすべてプリセットとして収録する。

| カテゴリ | 形状名 | 特徴 | 論文参照 |
|---|---|---|---|
| **正曲率** | 半球 (Hemisphere) | 一様正曲率 | Fig.17 |
| **正曲率** | 球 (Sphere) | 閉曲面・特異点必要 | Fig.19 |
| **負曲率** | 双曲面 (Hyperboloid) | 鞍点形状 | Fig.4 |
| **複合曲率** | プリングル (Hyperbolic Paraboloid) | 正負混在 | Fig.18 |
| **閉曲面** | トーラス | 穴あき閉曲面 | Fig.3 |
| **有機形状** | クラウド | 不規則有機形 | Fig.19 top |
| **有機形状** | ハート | 対称有機形 | Fig.19 mid |
| **建築形状** | スタジアム屋根 | 大スパン構造 | Fig.22 |
| **建築形状** | シェル | 片持ち屋根 | Fig.22 |
| **建築形状** | 植物園ドーム | 複合曲面 | Fig.22 |
| **ファッション** | ドレスA | GarmentCode出力 | Fig.21 |
| **ファッション** | ドレスB | GarmentCode出力 | Fig.21 |
| **カスタム** | OBJ/STLインポート | 任意メッシュ | — |

### 5.3 形状編集機能

#### 5.3.1 インタラクティブ変形
- **パラメトリックスライダー**: 各プリセット形状のパラメータ（半径、曲率、アスペクト比等）をスライダーで変更
- **スカルプトモード**: マウスドラッグによるメッシュ頂点プッシュ/プル（Three.jsのRaycasting使用）
- **対称拘束**: X/Y/Z軸対称モード切り替え
- **OBJインポート**: 任意メッシュのドラッグ&ドロップインポート

#### 5.3.2 メッシュ表示オプション

| トグル | 内容 |
|---|---|
| **Wireframe** | メッシュの三角形・四角形を表示 |
| **Gaussian Curvature** | ガウス曲率をカラーマップで表示（青=負、赤=正） |
| **Mean Curvature** | 平均曲率マップ |
| **Remesh Preview** | Tangramによるリメッシュ結果をオーバーレイ表示 |
| **Singularities** | 特異点位置を球（赤）で表示 |
| **Directional Field** | N-vectorフィールドを短いストローク線で可視化 |

#### 5.3.3 リメッシュ設定
- **解像度スライダー**: ステッチ線数の目標値（50〜1000）
- **境界整列**: 境界条件のON/OFF
- **フィールド整列**: ユーザー指定の方向拘束（特定面の法線方向等）

---

## 6. Tangram Panel 詳細仕様

### 6.1 概要

論文の中核概念であるTangramグラフを設計者が直接操作・観察できる2D/3Dハイブリッドビューア。論文のFig.6, 8, 9, 10, 27に相当する表現を提供する。

### 6.2 デュアルビュー構成

```
┌─────────────────────────────────────────────────────┐
│  TANGRAM PANEL                                      │
│  ┌──────────────────────┬───────────────────────┐  │
│  │  OPEN CONFIGURATION  │  CLOSED CONFIGURATION │  │
│  │  (2D smocking pat.)  │  (3D structure)        │  │
│  │                      │                        │  │
│  │  [アンダーレイ=青]    │  [アンダーレイ=青]     │  │
│  │  [プリーツ=ピンク]   │  [プリーツ=ピンク]    │  │
│  │  [ステッチ線=黒]     │  [3D飛び出し表示]     │  │
│  └──────────────────────┴───────────────────────┘  │
│  ←─────── η スライダー ──────────────────────────→  │
│            0 (Open)              1 (Closed)         │
└─────────────────────────────────────────────────────┘
```

### 6.3 η スライダー

論文Eq.(1c)のパラメータ η をリアルタイムに操作する。  
- η = 1.0 → Open Tangram（元の2Dパターン）  
- η = 0.0 → Closed Tangram（縫い合わせ後の構造）  
- 中間値 → 縫い合わせ過程のアニメーション  
スライダー操作中、左右のビューが同期してアニメーションする。

### 6.4 Tangramグラフの視覚表現

論文の色定義に準拠する：

| 要素 | 色 | 論文参照 |
|---|---|---|
| アンダーレイ面 (Underlay Face) | 青 #4A90D9 | Fig.8, 27 |
| プリーツ面 (Pleat Face) | ピンク #E8669A | Fig.8, 27 |
| アンダーレイ辺 (Underlay Edge) | 黄色 #F5C518 | Fig.8 |
| ステッチ線 (Stitching Line) | 黒 | Fig.8 |
| シーム (Seam) | オレンジ点線 | Fig.13, 14 |
| 特異点 (Singularity) | 赤 #E84040 | Fig.12, 19 |
| 縫い合わせ方向矢印 | グレー矢印 | Fig.6 |

### 6.5 スモッキングパターンライブラリ

論文掲載パターンを全収録する。

#### Translational Symmetry (N=2) — 並進対称パターン
| パターン名 | 特徴 | Tangram形状 |
|---|---|---|
| **Arrow** | 矢型プリーツ。Closed時にプリーツ面が消失 | 三角形タイリング |
| **Braid** | 編み込み型。プリーツ面が残存 | 六角形混合タイリング |
| **Leaf** | 葉型。Closedが独特の六角形構造 | 六角形タイリング |
| **Heart** | ハート型。LeafとClosed構造が類似 | 六角形タイリング |
| **Box** | 箱型。格子状プリーツ | 四角形タイリング |
| **Brick** | レンガ型。Closed時プリーツ消失 | 菱形タイリング |
| **Diamond** | 菱形。アンダーレイ面が非連結 | 菱形タイリング |
| **WaterBomb** | 水爆型（折り紙由来）。4回対称 | 正方形タイリング |

#### Rotational Symmetry (N=3) — 3回対称パターン（Resch-3系）
| パターン名 | 特徴 | 利用可能特異点 |
|---|---|---|
| **Resch-3a** | 三角形ベース。auxeticパターンと類似 | ±1/3 |
| **Resch-3b** | 三角形バリエーション | ±1/3 |

#### Rotational Symmetry (N=4) — 4回対称パターン（Resch-4系）
| パターン名 | 特徴 | 利用可能特異点 |
|---|---|---|
| **Resch-4 (WaterBomb)** | 正方形グリッドClosed | ±1/4 |

#### Rotational Symmetry (N=6) — 6回対称パターン（Resch-6系）
| パターン名 | 特徴 | 利用可能特異点 |
|---|---|---|
| **Resch-6** | 六角形グリッドClosed | ±1/6 |

### 6.6 カスタムパターンエディター

既存パターンを元に新規パターンを設計するエディター。

**機能一覧**：
- **頂点追加/削除**: 格子グリッド上での頂点操作（スナップ機能付き）
- **ステッチ線定義**: 頂点を順番にクリックしてステッチ線を定義
- **ユニットパターン**: ユニットセルを定義してタイリング密度を指定
- **Well-Constrained チェック**: Remark B.1（論文Appendix B）に基づき、Tangram閉形態が存在するかどうかをリアルタイム検証
- **対称性検出**: 設計したパターンの対称性（N=2/3/4/6）を自動検出
- **パターン保存**: ユーザー定義パターンをJSONで保存/読み込み

---

## 7. Result Panel 詳細仕様

### 7.1 概要

最適化されたスモッキングパターンを縫い合わせた後の3D形状をプレビューするパネル。論文のFig.3(d)、Fig.4、Fig.17、Fig.19の「smocked result (preview)」に相当。

### 7.2 プレビュー生成

ARAPベースのメッシュ変形（論文Sec.6）によるリアルタイムプレビューを提供する。

**生成プロセス**:
1. 最適化済みTangram (Y°) を高解像度にアップサンプル
2. ARAP変形でY° → Y^c への変形を計算
3. 平均値座標（MVC）でプリーツ面の飛び出し方向を決定
4. シームレスARAPでシーム部分の整合性を確保

### 7.3 表示モード

| モード | 内容 | 論文参照 |
|---|---|---|
| **Smocked** | デフォルト。プリーツの3D立体形状 | Fig.19(d) |
| **Heatmap** | 形状近似誤差（Eshape）のヒートマップ。低誤差=青、高誤差=赤 | — |
| **Pleat Quality** | Epleatの分布。プリーツ形状の規則性を可視化 | Fig.15 |
| **Seam Compatibility** | Eseamの分布。シーム整合性を可視化 | Fig.14 |
| **Tangram Overlay** | 3D上にClosed Tangramをオーバーレイ表示 | Fig.3 |
| **Transparent** | 半透明表示で内部構造（Fig.7の内側）を確認 | Fig.7 |
| **Front/Back** | 表裏を切り替え表示 | Fig.2, 19 |

### 7.4 インタラクション

- **軌道カメラ**: マウスドラッグで回転、ホイールでズーム
- **断面表示**: 任意平面でのクロスセクション表示
- **寸法表示**: プリーツ高さ・幅のスケール表示
- **マテリアル設定**: 布地色、厚み、透明度を変更（視覚確認用）
- **アニメーション再生**: Open状態から縫い合わせ過程を連続アニメーション

---

## 8. Inspector Panel 詳細仕様

下部コラプシブルパネル。4つのタブで構成。

### 8.1 Optimization タブ

最適化パラメータの制御と収束状況のモニタリング。

```
┌────────────────────────────────────────────────────────────────┐
│  OPTIMIZATION                                         [Run ▶]  │
│                                                                │
│  Weights                                                       │
│  ws (Shape)   [━━━━━━━━━━●━━] 1.00                           │
│  wp (Pleat)   [━━━━━━━━●━━━━] 100 → 0 (decay 20%/iter)       │
│  wc (Seam)    [━━●━━━━━━━━━━] 0.10                           │
│                                                                │
│  Settings                                                      │
│  η initial    [━━━━━━━━━━━━●] 0.00 (Fully closed)            │
│  Max iterations  [100]    Threshold  [1e-4]                   │
│  Init from    [● Open Tangram]  [○ Half-closed (η=0.5)]       │
│                                                                │
│  Status                                                        │
│  Iteration: 47/100   Eshape: 2.3e-5   Epleat: 0.012          │
│  ████████████████████████░░░░░░ Converged ✓                   │
│  Runtime: 8.3s   |L|: 312 stitch lines                        │
└────────────────────────────────────────────────────────────────┘
```

**パラメータ説明**（ホバーでツールチップ表示）:
- `ws`: 形状近似の重み。高いほど目標形状に忠実
- `wp`: プリーツ形状の規則性重み。最適化が進むにつれ自動で低下
- `wc`: シーム整合性の重み。特異点がある場合に有効
- `η initial`: 最適化の初期状態。0=Closed起点、0.5=半クローズ起点（プリーツサイズ調整に使用。論文Fig.16）

### 8.2 Singularities タブ

特異点の配置・種類の制御。論文Fig.12、13、14に対応。

```
┌────────────────────────────────────────────────────────────────┐
│  SINGULARITIES                                                 │
│                                                                │
│  Mode    [● Auto]  [○ Manual]  [○ None]                       │
│                                                                │
│  Auto Configuration (computed from field)                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Index  │  Position (u,v)   │  Type      │  [Remove]    │ │
│  │  +1/4   │  (0.23, 0.51)     │  Pos. cone │  [×]         │ │
│  │  +1/4   │  (0.77, 0.48)     │  Pos. cone │  [×]         │ │
│  │  −1/4   │  (0.50, 0.12)     │  Neg. cone │  [×]         │ │
│  │  −1/4   │  (0.50, 0.88)     │  Neg. cone │  [×]         │ │
│  └──────────────────────────────────────────────────────────┘ │
│  [+ Add Singularity]                                          │
│                                                                │
│  Available Indices: ±1/3, ±1/4, ±1/6  (pattern-dependent)    │
│  ⚠ Sum of indices must equal χ(M) · N/2  (Poincaré-Hopf)    │
└────────────────────────────────────────────────────────────────┘
```

**Manual モード**:
- Shape Panelのメッシュ上をクリックして特異点を手動配置
- インデックス（±1/3, ±1/4, ±1/6）をパターンに応じてプルダウン選択
- Poincaré-Hopf 定理の充足チェックをリアルタイム表示

### 8.3 Analysis タブ

設計の定量的評価とパターン分析。

```
┌────────────────────────────────────────────────────────────────┐
│  ANALYSIS                                                      │
│                                                                │
│  Shape Approximation                                          │
│  Edge reproduction error (Eshape): 2.3e-5  ✓ (<1e-4)        │
│  Max local error: 4.1e-5  at (u=0.3, v=0.7) [locate →]      │
│  Coverage: 98.2% of target surface                            │
│                                                                │
│  Pleat Quality                                                 │
│  Mean angle deviation (Epleat): 0.012 rad                     │
│  Uniformity score: 0.94 / 1.00  [★★★★☆]                     │
│  Worst pleat: face #47  [highlight →]                         │
│                                                                │
│  Pattern Statistics                                           │
│  Stitching lines |L|: 312                                     │
│  Underlay faces: 624                                          │
│  Pleat faces: 156                                             │
│  Singularities: 4 (±1/4)                                     │
│  Pattern symmetry: 4-RoSy (Resch-4)                          │
│                                                                │
│  Fabricability Check                                          │
│  [✓] Well-constrained Tangram                                 │
│  [✓] Seam compatibility (Eseam < 0.001)                      │
│  [✓] No self-intersection in preview                         │
│  [⚠] Pleat face #47: high distortion (>15°)                 │
│                                                                │
│  [Export Analysis Report PDF]                                 │
└────────────────────────────────────────────────────────────────┘
```

### 8.4 Compare タブ

複数デザイン案の並列比較。

- 最大4案を同時保存・比較
- 各案のEshape / Epleat / Eseam / Runtime を並列表示
- パターン種 × 目標形状のマトリクスビューで組み合わせ探索
- 案をクリックしてメインビューに読み込み

---

## 9. 最適化エンジン仕様

### 9.1 Tangram Closing（論文Eq.1）

```javascript
// 最適化問題:
// min_{Xe} αs·Estitch(Xe) + αr·Erigid(Xe)
//
// Erigid: アンダーレイ面・辺の剛体変換保持
// Estitch: ステッチ線の長さをη·l_ij に縮小
```

**実装**:
- Newton法（per-element projected Hessian）
- autodiffによる勾配・ヘッセ計算
- 初期値: Open Tangramの位置
- 収束条件: エネルギー変化 < 1e-6

### 9.2 逆設計最適化（論文Eq.5）

```javascript
// 最適化問題:
// Y° = argmin_Y  ws·Eshape(Y) + wp·Epleat(Y) + wc·Eseam(Y)
//
// Eshape: 辺長比率による形状近似誤差（論文Eq.2）
// Epleat: プリーツ面内角度保持（論文Eq.3）
// Eseam:  シーム辺長・角度整合性（論文Eq.4a/4b/4c）
```

**実装**:
- Newton法（反復）
- wp の動的スケジューリング: 各反復で 20% 減少
- 収束条件: Eshape < 1e-4 または最大反復100回
- JavaScript実装（WebWorkerで非同期実行、UIブロックなし）

### 9.3 ARAPプレビュー（論文Sec.6）

```javascript
// as-rigid-as-possible mesh deformation
// 高解像度メッシュを Y° から Y^c へ変形
// MVC（Mean Value Coordinates）でプリーツ飛び出し方向を解決
// シームレスARAPによるシーム境界の整合
```

---

## 10. インポート・エクスポート仕様

SmockingCAD のI/O設計は、**川上（3D形状データ）→ 設計プロセス → 川下（製作データ）** の流れを軸に、各フェーズで使われるツールチェーンとの相互運用性を最大化する。

---

### 10.1 I/O フロー全体図

```
【川上：目標形状の入力】
  Rhinoceros/Grasshopper  ──── OBJ/STL/3DM ────►┐
  Blender / Maya / FBX    ──── OBJ/FBX/STL ────►│
  ArchiCAD / Revit        ──── IFC → OBJ 変換 ──►│  Shape Panel
  GarmentCode             ──── OBJ/JSON ────────►│  (目標形状)
  点群スキャン (LiDAR等)   ──── PLY/XYZ → 変換 ──►┘

                                 ↓ 逆設計最適化

【中間：スモッキングパターンの往来】
  既存縫製CAD / Illustrator ── DXF/SVG ─────────►┐
  手作業スモッキング記録     ── DXF/SVG ─────────►│  Pattern Panel
  他の SmockingCAD インスタンス── .smock/JSON ────►│  (Tangramグラフ)
                                                  │
  ◄──────── DXF/SVG/JSON ──────────────────────────┘

                                 ↓ 最適化完了

【川下：製作・提出データの出力】
  Result Panel ──── OBJ/STL ─────► Rhinoceros, Blender, スライサー
               ──── IFC ──────────► BIM統合（建築用途）
               ──── DXF ──────────► AutoCAD, レーザーカッター
               ──── SVG ──────────► Illustrator, Inkscape, カッティングプロッター
               ──── PDF ──────────► 印刷, A0出力, トレーシング
               ──── GLTF/GLB ─────► Webビューア, Unity, UE5
               ──── .smock ───────► プロジェクト保存・共有
```

---

### 10.2 インポート仕様

#### 10.2.1 目標形状インポート（Shape Panel）

SmockingCAD に与える3D目標形状の入力フォーマット。**インポート後は自動でリメッシュ提案**が行われ、解像度を指定してからTangram最適化を開始する。

| フォーマット | 拡張子 | 入力元 | 備考 |
|---|---|---|---|
| **OBJ** | `.obj` | Rhinoceros, Blender, Maya, GarmentCode | 最優先対応。マテリアルファイル(.mtl)は無視 |
| **STL** | `.stl` | Rhinoceros, SolidWorks, 各種スライサー | ASCII / バイナリ両対応 |
| **PLY** | `.ply` | 点群スキャナー, Blender | カラー情報は曲率視覚化に流用可 |
| **3DM** | `.3dm` | Rhinoceros ネイティブ | NURBS → 三角メッシュ変換（tessellation解像度指定） |
| **FBX** | `.fbx` | Maya, 3ds Max, Unity | マルチオブジェクトの場合は対象選択ダイアログ |
| **GLTF/GLB** | `.gltf` / `.glb` | Blender, WebXR | マルチメッシュは結合処理 |
| **JSON (GarmentCode)** | `.json` | GarmentCode [Korosteleva 2023] | パラメトリック縫製パターンから直接3D形状生成 |
| **IFC** | `.ifc` | ArchiCAD, Revit, ARCHICAD | IfcShell / IfcFaceBasedSurface を対象 |
| **SVG (平面展開)** | `.svg` | Illustrator, Inkscape | 2D輪郭から回転体・押し出し形状を推定（制約あり） |

**インポート後の前処理パイプライン**:
```
1. メッシュ修復      — 穴埋め、法線統一、孤立頂点除去
2. スケール正規化     — 長手方向を100単位にリスケール（手動上書き可）
3. 向き整合          — 法線外向き統一
4. 曲率計算          — ガウス曲率・平均曲率の事前計算
5. 解像度提案        — 目標ステッチ数に基づくリメッシュ解像度の自動提案
6. 特異点位置推定     — 高曲率領域から特異点候補を自動検出
```

**インポートダイアログのオプション**:
```
┌──────────────────────────────────────────────────────────┐
│  Import: stadium_roof.obj                                │
│                                                          │
│  Original: 12,847 faces  / 6,429 verts                  │
│  Bounding: 24.3 × 18.7 × 6.2 m                         │
│                                                          │
│  Target scale:  [1.0]  ×  original                      │
│  Units:  [● m]  [○ cm]  [○ mm]  [○ auto-detect]        │
│                                                          │
│  Remesh target: [300] stitching lines  ←スライダー        │
│  → Estimated faces after remesh: ~600                   │
│                                                          │
│  [✓] Auto-repair mesh (fill holes, fix normals)         │
│  [✓] Pre-compute curvature maps                         │
│  [✓] Suggest singularity positions                      │
│                                                          │
│               [Cancel]  [Import]                        │
└──────────────────────────────────────────────────────────┘
```

---

#### 10.2.2 スモッキングパターンインポート（Pattern Panel）

DXFまたはSVGで記述された既存のスモッキングパターンを取り込み、Tangramグラフを自動構築する。

##### DXFインポート

DXFファイルはレイヤー構造を持つため、インポート時に**各レイヤーが何の線種に対応するかをユーザーが指定**するダイアログを表示する。

```
┌──────────────────────────────────────────────────────────────────┐
│  DXF Layer Mapping  —  my_smocking_pattern.dxf                  │
│                                                                  │
│  DXFファイル内のレイヤー一覧と、SmockingCAD での意味を対応付けてください。│
│                                                                  │
│  Layer Name        │ Color  │ Count │ Assign to              │  │
│  ─────────────────────────────────────────────────────────────  │
│  0 (default)       │ White  │   24  │ [Ignore ▼]             │  │
│  STITCH_LINES      │ Black  │  312  │ [Stitching Lines ▼]   ★│  │
│  UNDERLAY_GRID     │ Blue   │ 1248  │ [Underlay Edges ▼]    ★│  │
│  PLEAT_BOUNDARY    │ Pink   │  156  │ [Pleat Boundaries ▼]  │  │
│  SEAMS             │ Orange │   18  │ [Seam Lines ▼]         │  │
│  REFERENCE_GRID    │ Gray   │  400  │ [Reference Grid ▼]    │  │
│  DIMENSIONS        │ Lt.Gray│   80  │ [Ignore ▼]             │  │
│  TEXT              │ Green  │   45  │ [Ignore ▼]             │  │
│                                                                  │
│  Assign to の選択肢:                                             │
│    Stitching Lines  /  Underlay Edges  /  Pleat Boundaries      │
│    Seam Lines  /  Reference Grid  /  Ignore                     │
│                                                                  │
│  ★ = Auto-detected from layer name                             │
│                                                                  │
│  Unit:  [● mm]  [○ cm]  [○ m]   Scale: [1.0]                  │
│  [✓] Auto-detect stitching line grouping (shared vertices)      │
│  [✓] Auto-detect underlay / pleat face regions                  │
│                                                                  │
│  Preview: [312 stitching lines, 8 unit patterns detected]       │
│                                                                  │
│                          [Cancel]  [Import]                     │
└──────────────────────────────────────────────────────────────────┘
```

**DXFインポート後の自動処理**:
```
1. レイヤー分類          — 指定マッピングに基づき線を分類
2. ステッチ線グループ化   — 共有端点を持つ線分を1つのステッチ線ℓに統合
3. ユニットパターン検出   — タイリング周期を自動検出（FFT/周期解析）
4. Tangramグラフ構築      — Def.4.2に基づきアンダーレイ面・プリーツ面を自動分類
5. Well-Constrainedチェック — Remark B.1: Tangram閉形態の存在確認
6. 対称性検出             — N=2/3/4/6 の対称性を自動判定
```

##### SVGインポート

Illustrator / Inkscapeで作成したスモッキングパターンを取り込む。

**SVGのレイヤー/グループ対応**:

```
SVGのレイヤー/グループID    →    SmockingCAD要素
─────────────────────────────────────────────────
id="stitch*" または "縫*"   →    Stitching Lines（自動検出）
id="underlay*"              →    Underlay Edges
id="pleat*"                 →    Pleat Boundaries
id="seam*"                  →    Seam Lines
id="grid*"                  →    Reference Grid（無視）
その他                       →    マッピングダイアログで指定
```

**DXF/SVG インポート フォーマット比較**:

| 項目 | DXF | SVG |
|---|---|---|
| 主な入力元 | AutoCAD, Rhinoceros, レーザーCAD | Illustrator, Inkscape, 手書きスキャン |
| レイヤー構造 | レイヤー名 | グループID / レイヤー名 |
| 座標精度 | 高精度（倍精度浮動小数） | 中精度（px単位）→ 単位変換必要 |
| 曲線対応 | 直線・円弧・スプライン | パス（bezier）→ 折れ線近似 |
| 向き情報 | なし | なし |

##### JSONインポート（SmockingCAD 相互交換）

別のSmockingCADインスタンスや外部スクリプトで生成したパターンデータ。

```json
{
  "smocking_pattern": {
    "format": "smockingcad-pattern-v1",
    "symmetry": "N4",
    "unit_cell": {
      "vertices": [[0,0],[1,0],[0.5,0.866],...],
      "edges": [[0,1],[1,2],...],
      "stitching_lines": [[0,1,2],[3,4,5],...]
    },
    "tiling": { "u_repeat": 8, "v_repeat": 6 },
    "singularities": [{"index": 0.25, "uv": [0.5, 0.5]}]
  }
}
```

---

#### 10.2.3 プロジェクトインポート

| フォーマット | 拡張子 | 内容 |
|---|---|---|
| **SmockingCAD Project** | `.smock` | フルプロジェクト（形状+パターン+最適化結果） |
| **SmockingCAD Pattern** | `.smockpat` | パターン定義のみ（ライブラリ共有用） |

---

### 10.3 エクスポート仕様

#### 10.3.1 製作出力（2D ステッチパターン）

##### DXFエクスポート

製作現場・レーザーカッターCADとの連携に最も重要なフォーマット。**全要素をレイヤー分離**して出力する。

```
DXF出力レイヤー構成:

  Layer 00_REFERENCE_GRID     — 基準格子線（Color: 8/Gray, Ltype: DOT2）
  Layer 01_UNDERLAY_EDGES     — アンダーレイ辺（Color: 5/Blue, Ltype: CONTINUOUS）
  Layer 02_PLEAT_BOUNDARIES   — プリーツ面境界（Color: 6/Magenta, Ltype: CONTINUOUS）
  Layer 03_STITCH_LINES       — ステッチ線本体（Color: 7/White, Ltype: CONTINUOUS, LW: 0.4mm）
  Layer 04_STITCH_ENDPOINTS   — ステッチ線端点（Color: 7/White, POINT entity）
  Layer 05_SEAMS              — シーム線（Color: 30/Orange, Ltype: DASHED）
  Layer 06_SEAM_LABELS        — シーム対応ラベル（Color: 30/Orange, TEXT: "A1","A2"...）
  Layer 07_SINGULARITIES      — 特異点マーク（Color: 1/Red, CIRCLE entity, r=2mm）
  Layer 08_STITCH_NUMBERS     — ステッチ線番号（Color: 8/Gray, TEXT entity）
  Layer 09_DIMENSIONS         — 寸法線（Color: 8/Gray, DIMENSION entity）
  Layer 10_BORDER_CUTLINE     — 裁断外形線（Color: 4/Cyan, Ltype: CONTINUOUS, LW: 0.8mm）
  Layer 11_ANNOTATIONS        — メタ情報テキスト（Color: 8/Gray, TEXT: パターン名・日時等）
  Layer 12_LASER_ENGRAVE      — レーザー刻印用合成（03+05レイヤーをコピー統合）

出力オプション:
  DXFバージョン: [R2000]  [R2004]  [R2010]  [R2018]
  単位:         [mm]  [cm]  [m]  [inch]
  スケール:      [1:1]  [1:2]  [1:5]  [カスタム]
  エンティティ:  [● LWPOLYLINE]  [○ LINE (個別線分)]
  テキスト高さ:  [3.0] mm
  用紙枠出力:   [✓]  サイズ: [A0▼]  [横/縦▼]
```

**用途別レイヤー可視性プリセット**:

| プリセット名 | 有効レイヤー | 用途 |
|---|---|---|
| **Laser Engrave** | 12_LASER_ENGRAVE のみ | レーザーカッターへの直接入稿 |
| **Sewing Full** | 03+04+05+06+07+08 | 裁縫師向けフル情報 |
| **Seam Only** | 05+06 | シーム縫い合わせ工程のみ |
| **Reference** | 00+01+02+03 | Tangramグラフ確認用 |
| **All Layers** | 全レイヤー | 設計者レビュー用 |

---

##### SVGエクスポート

```
SVG出力仕様:

  viewBox: 実寸ベース（単位: mm）
  <defs>内:
    <style> — レイヤー別スタイル定義
    <marker> — 矢印・端点マーカー定義
    <pattern> — 格子パターン定義

  <g id="layer-00-reference-grid">  — 基準格子 (stroke: #AAAAAA, opacity: 0.4)
  <g id="layer-01-underlay">        — アンダーレイ (stroke: #4A90D9, fill: rgba(74,144,217,0.15))
  <g id="layer-02-pleat">           — プリーツ (stroke: #E8669A, fill: rgba(232,102,154,0.15))
  <g id="layer-03-stitch-lines">    — ステッチ線 (stroke: #1A1A1A, stroke-width: 1.5)
  <g id="layer-04-stitch-endpoints">— 端点 (fill: #1A1A1A, r=2)
  <g id="layer-05-seams">           — シーム (stroke: #FF7A00, stroke-dasharray: 4 3)
  <g id="layer-06-seam-labels">     — ラベル
  <g id="layer-07-singularities">   — 特異点 (fill: #E84040)
  <g id="layer-08-numbers">         — 番号テキスト
  <g id="layer-09-border">          — 外形線

  出力オプション:
    カラー: [● 論文準拠カラー]  [○ モノクロ（印刷用）]  [○ カスタム]
    フォント埋め込み: [✓]
    Inkscape互換モード: [✓]（ガイド・原点情報付加）
    Adobe Illustrator互換: [✓]（レイヤーをAIレイヤーとして出力）
```

---

##### PDFエクスポート

```
PDF出力仕様:

  用紙サイズ: A4 / A3 / A2 / A1 / A0 / カスタム（W × H mm）
  向き: 縦 / 横 / 自動（パターンに合わせて最適化）
  スケール:
    [● 1:1 実寸]  ← レーザーカッター・トレーシング用
    [○ Fit to page]
    [○ カスタム比率]
  複数ページ分割: [✓] A4分割印刷（のりしろ指定: 5mm）
  レイヤー: [Acrobat Layers として出力]
  PDF/A: [○] アーカイブ互換
  カラースペース: [● CMYK]  [○ RGB]
```

---

#### 10.3.2 3D形状出力（Result Panel — Smocked Result）

##### OBJエクスポート

```
OBJ出力仕様（smocked_result.obj）:

  メッシュ内容:
    ① Smocked surface mesh  — ARAPプレビューの変形後メッシュ（高解像度）
    ② Closed Tangram mesh   — Tangramの閉形態（低解像度・フレーム）
    ③ Target mesh           — 目標形状メッシュ（比較用）

  Groups:
    g smocked_surface        — ①全体
    g underlay_faces         — ①のアンダーレイ面のみ
    g pleat_faces            — ①のプリーツ面のみ
    g closed_tangram         — ②
    g target_shape           — ③

  Material (.mtl):
    mtl smocked_surface:      Kd 0.9 0.85 0.75  (布地ベージュ)
    mtl underlay_faces:       Kd 0.29 0.56 0.85  (アンダーレイ青)
    mtl pleat_faces:          Kd 0.91 0.40 0.60  (プリーツピンク)
    mtl closed_tangram:       Kd 0.3 0.3 0.3, wireframe
    mtl target_shape:         Kd 0.5 0.5 0.5, d 0.3  (半透明)

  出力オプション:
    出力グループ: [✓①] [✓②] [✓③]
    三角形化: [✓] 四角形を三角形に分割（Rhinoceros互換）
    法線出力: [✓] スムーズシェーディング用
    UV出力:   [✓] 2D展開パターンとの対応UV
    単位:     [mm]  [cm]  [m]
```

##### STLエクスポート

```
STL出力仕様:

  対象: smocked surface mesh (①のみ)
  形式: [● Binary STL]  [○ ASCII STL]
  用途: 3Dプリント, FEM解析

  出力オプション:
    厚み付加: [○] 布地厚みを法線方向にオフセット  厚さ: [0.5] mm
    閉曲面化: [○] 底面を追加して閉曲面にする（3Dプリント用）
    単位:     [mm]（STL標準）

  ⚠ STL は単一メッシュのみ。グループ分割は OBJ/GLTF を使用してください。
```

##### GLTF / GLBエクスポート

```
GLTF出力仕様:

  フォーマット: [● GLB (バイナリ統合)]  [○ GLTF+bin (分離)]
  含むデータ:
    [✓] Smocked surface
    [✓] マテリアル（PBR: roughness=0.8, metallic=0.0）
    [✓] テクスチャ（ステッチパターンをUVマップとして焼き込み）
    [○] Tangram wireframe overlay
    [○] アニメーション（Open → Closed の変形モーフ）

  用途: Webビューア, Spline, Unityゲームエンジン, AR/VR
```

##### IFC エクスポート（建築用途）

建築分野ユーザー向けのBIM連携フォーマット。

```
IFC出力仕様:

  IFCバージョン: [IFC4.3]  [IFC4]  [IFC2x3]
  エンティティ: IfcSite > IfcBuilding > IfcBuildingElement
  クラス割り当て:
    Smocked surface  → IfcMember (構造膜として)
    Target shape     → IfcSpace (参照形状として)

  プロパティセット（IfcPropertySet: Pset_SmockingCAD）:
    SmockingPattern:      "Resch-4"
    StitchLineCount:      312
    SingularityCount:     4
    ShapeError_Eshape:    2.3e-5
    PleatQuality_Epleat:  0.012
    GeneratedBy:          "SmockingCAD v0.1"
    SourcePaper:          "Segall et al. ACM TOG 2024"

  ⚠ IFC出力はPhase 3以降での対応。Phase 1/2 では OBJ での代替を推奨。
```

---

#### 10.3.3 データ交換・中間フォーマット出力

##### JSONエクスポート（Tangram生データ）

外部スクリプト（Python / Grasshopper / Julia等）での後処理や研究用途向けに、最適化結果の生データをJSONで出力する。

```json
{
  "format": "smockingcad-result-v1",
  "metadata": {
    "generated": "2026-03-26T14:32:00Z",
    "tool": "SmockingCAD v0.1",
    "source_paper": "Segall et al. ACM TOG 2024"
  },
  "target_shape": {
    "name": "stadium_roof",
    "vertex_count": 668,
    "face_count": 1332
  },
  "smocking_pattern": {
    "name": "Resch-4",
    "symmetry": "N4",
    "unit_cell": { ... }
  },
  "optimization": {
    "ws": 1.0, "wp": 100.0, "wc": 0.1,
    "eta_initial": 0.0,
    "iterations": 47,
    "Eshape_final": 2.3e-5,
    "Epleat_final": 0.012,
    "runtime_sec": 8.3
  },
  "tangram_open": {
    "vertices": [[x0,y0], [x1,y1], ...],
    "underlay_edges": [[0,1], [1,2], ...],
    "stitching_lines": [[0,1,2], [3,4,5], ...],
    "seams": { "C": [[...]], "C_prime": [[...]] }
  },
  "tangram_closed": {
    "vertices": [[x0,y0,z0], [x1,y1,z1], ...],
    "underlay_edges": [[0,1], ...],
    "singularities": [{"vertex_idx": 42, "index": 0.25}, ...]
  },
  "stitch_pattern_2d": {
    "lines": [
      { "id": 1, "points": [[12.3, 45.6], [18.9, 45.6], [25.1, 51.2]] },
      ...
    ],
    "seam_pairs": [
      { "label": "A", "C_edges": [...], "C_prime_edges": [...] }
    ]
  }
}
```

##### CSVエクスポート（解析データ）

Analysis タブの定量データをCSVで出力する。

```
smocking_analysis.csv の列構成:

  face_id, face_type, centroid_u, centroid_v,
  Eshape_local, Epleat_local, is_singularity,
  pleat_angle_deviation_deg, pleat_height_estimate_mm
```

---

#### 10.3.4 プロジェクト保存フォーマット

##### `.smock` — フルプロジェクト

```json
{
  "version": "0.1",
  "metadata": { "name": "stadium_roof_v3", "created": "...", "modified": "..." },
  "target_shape": {
    "type": "imported_obj",
    "filename": "stadium_roof.obj",
    "mesh_base64": "...(省略可: 外部ファイル参照も可)...",
    "transform": { "scale": 1.0, "units": "m" }
  },
  "smocking_pattern": {
    "type": "preset",
    "name": "Resch-4",
    "tiling": { "u_repeat": 12, "v_repeat": 10, "resolution": 300 }
  },
  "singularities": [
    { "index": 0.25, "uv": [0.23, 0.51], "mode": "manual" }
  ],
  "optimization_params": {
    "ws": 1.0, "wp": 100, "wc": 0.1,
    "eta_initial": 0.0, "max_iter": 100, "threshold": 1e-4
  },
  "result": {
    "converged": true,
    "tangram_open": { ... },
    "tangram_closed": { ... },
    "preview_mesh": "...(base64 or external ref)..."
  },
  "design_history": [
    { "timestamp": "...", "action": "changed_pattern", "from": "Arrow", "to": "Resch-4" },
    { "timestamp": "...", "action": "optimization_run", "result": "converged" }
  ]
}
```

##### `.smockpat` — パターン単体（ライブラリ共有用）

```json
{
  "format": "smockingcad-pattern-v1",
  "name": "My Custom Arrow Variant",
  "author": "...",
  "symmetry": "N2",
  "well_constrained": true,
  "unit_cell": { ... },
  "preview_svg": "data:image/svg+xml;base64,..."
}
```

---

### 10.4 Grasshopper / Rhinoceros 連携

建築設計ユーザーが最も多用するRhinoceros/Grasshopperとの深い連携を提供する。

```
連携方式:

  方式A: ファイル経由
    Rhinoceros → OBJ/3DM エクスポート → SmockingCAD インポート
    SmockingCAD → OBJ/DXF エクスポート → Rhinoceros インポート

  方式B: GHコンポーネント（Phase 3以降）
    Grasshopper上のSmockingCADコンポーネント（GHX）として提供
    ┌──────────────────────────────────────────┐
    │  [SmockingCAD]  GH Component            │
    │  Input:                                  │
    │    Mesh M  ─── 目標形状                  │
    │    Int P   ─── パターンID                │
    │    Num ws  ─── 形状重みws                │
    │    Num wp  ─── プリーツ重みwp            │
    │    Int N   ─── ステッチ線数目標          │
    │  Output:                                 │
    │    Crv[]   ─── ステッチ線（Curve配列）   │
    │    Crv[]   ─── シーム線                  │
    │    Mesh    ─── Smockedプレビューメッシュ  │
    │    Num     ─── Eshape誤差値              │
    └──────────────────────────────────────────┘
```

---

### 10.5 I/O フォーマット対応マトリクス（総覧）

| フォーマット | 入力 | 出力 | Phase | 主な用途 |
|---|:---:|:---:|:---:|---|
| **OBJ** | ✓ Shape | ✓ 3D結果 | 1 | 汎用3D形状交換 |
| **STL** | ✓ Shape | ✓ 3D結果 | 1 | 3Dプリント・FEM |
| **PLY** | ✓ Shape | — | 2 | 点群・スキャンデータ |
| **3DM** | ✓ Shape | — | 2 | Rhinoceros連携 |
| **FBX** | ✓ Shape | — | 3 | Maya/3ds Max連携 |
| **GLTF/GLB** | ✓ Shape | ✓ 3D結果 | 2 | Web共有・AR/VR |
| **IFC** | ✓ Shape | ✓ 3D結果 | 3 | BIM建築統合 |
| **DXF** | ✓ Pattern | ✓ 2Dパターン | 1 | CAD/レーザーカッター |
| **SVG** | ✓ Pattern | ✓ 2Dパターン | 1 | Illustrator・印刷 |
| **PDF** | — | ✓ 2Dパターン | 1 | 実寸印刷・提出 |
| **JSON (Pattern)** | ✓ Pattern | ✓ 生データ | 1 | スクリプト連携・研究 |
| **JSON (GarmentCode)** | ✓ Shape | — | 2 | 服飾CAD連携 |
| **CSV** | — | ✓ 解析値 | 2 | 定量評価・研究 |
| **GHX Component** | — | — | 3 | Grasshopper統合 |
| **.smock** | ✓ Project | ✓ Project | 1 | プロジェクト保存 |
| **.smockpat** | ✓ Pattern | ✓ Pattern | 1 | パターンライブラリ共有 |

---

## 11. 実装フェーズ計画

### Phase 1 — コアビューア（MVP）

**目標**: 論文のダイアグラムを忠実に再現する静的ビューア

| タスク | 内容 |
|---|---|
| Three.jsセットアップ | Shape Panel と Result Panelの3Dビューア |
| SVGビューア | Pattern Panelの2D Tangramグラフ表示 |
| プリセット形状 | 球・双曲面・トーラスの基本3形状 |
| プリセットパターン | Arrow・WaterBomb・Resch-4の基本3パターン |
| Tangram Closing アニメーション | η スライダーによるOpen↔Closedアニメーション |
| 色定義実装 | アンダーレイ=青、プリーツ=ピンクの論文準拠配色 |

### Phase 2 — 最適化エンジン

**目標**: ブラウザ内でEq.(5)を解く

| タスク | 内容 |
|---|---|
| Tangram Closing 最適化 | Eq.(1)のJavaScript実装 |
| 逆設計最適化 | Eq.(5)のNewton法実装（WebWorker） |
| リメッシュ | シームレスパラメタライゼーション（N=4簡易版） |
| ARAPプレビュー | 低解像度での高速プレビュー |
| 収束モニタリング | Inspector Panelのリアルタイム進捗表示 |

### Phase 3 — フルCAD機能

**目標**: 設計者が自由に探索できる完全版

| タスク | 内容 |
|---|---|
| 全プリセット実装 | 12形状 × 8+パターン |
| カスタムパターンエディター | グリッド上での自由パターン設計 |
| 特異点手動配置 | Manual モードの特異点操作 |
| Analysis タブ | 定量評価・製作可能性チェック |
| Compare タブ | 複数案比較機能 |
| 全エクスポート形式 | SVG/PDF/OBJ/GLB/.smock |
| N=3/N=6 対称対応 | Resch-3/6パターンの逆設計 |

---

## 12. デザインシステム

### 12.1 カラーパレット

```
論文準拠カラー（機能色）:
  --underlay:     #4A90D9   // アンダーレイ面（青）
  --pleat:        #E8669A   // プリーツ面（ピンク）
  --underlay-edge: #F5C518  // アンダーレイ辺（黄）
  --stitch:       #1A1A1A   // ステッチ線（黒）
  --seam:         #FF7A00   // シーム（橙）
  --singularity:  #E84040   // 特異点（赤）

UIカラー:
  --bg-primary:   #0D0D0F   // 最暗背景
  --bg-panel:     #16181C   // パネル背景
  --bg-surface:   #1E2126   // サーフェス
  --border:       #2A2E35   // ボーダー
  --text-primary: #E8EAF0   // メインテキスト
  --text-secondary: #7A8090 // サブテキスト
  --accent:       #4A90D9   // アクセント（論文ブルーと統一）

ヒートマップ（Viridis準拠）:
  低誤差: #440154 → #21918c → #fde725 :高誤差
```

### 12.2 タイポグラフィ

```
Display:  JetBrains Mono — パラメータ値・数値表示
Body:     Geist — UIラベル・説明文
Diagram:  IBM Plex Sans Condensed — 図中ラベル
```

### 12.3 インタラクション原則

1. **直接操作**: 数値入力よりもスライダー・ドラッグを優先
2. **即時反映**: パラメータ変更は100ms以内に視覚フィードバック
3. **逆伝播**: Result Panelのエラー箇所をクリックするとPattern Panelで対応位置を選択
4. **ダーク優先**: 3Dビューアの視認性を最大化するダークテーマ
5. **論文対照**: ツールチップで論文の数式・図番号を参照表示

---

## 13. 制約・将来拡張

### 13.1 Phase 1/2 で対象外とする機能

- 物理シミュレーション（布地材質特性の考慮）
- N=3 / N=6 完全対応（Phase 3以降）
- 連続曲率保証の理論的検証
- マルチスレッドWebAssembly最適化
- クラウドレンダリング・共同編集

### 13.2 将来拡張候補

| 機能 | 概要 | 関連論文 |
|---|---|---|
| **Kirigami拡張** | カットを含むスモッキング設計 | 論文Sec.8 Future Work |
| **Auxetic逆設計** | プログラマブルオーグゼティクス | Fig.25 |
| **GarmentCode連携** | 縫製パターンからスモッキングへの変換 | Fig.21 |
| **C-IPC統合** | 材質考慮の物理プレビュー | 論文Sec.8 |
| **AR/XR表示** | WebXRでの没入型プレビュー | — |

---

## 付録A：用語集（日本語⇔英語⇔論文記号）

| 日本語 | 英語 | 記号 |
|---|---|---|
| スモッキングパターン | Smocking Pattern | P = (V, E, L) |
| ステッチ線 | Stitching Line | ℓ ∈ L |
| アンダーレイ頂点 | Underlay Vertex | Vu |
| プリーツ頂点 | Pleat Vertex | Vp |
| アンダーレイ辺 | Underlay Edge | Eu |
| アンダーレイ面 | Underlay Face | — |
| プリーツ面 | Pleat Face | Fp |
| タングラムグラフ | Tangram Graph | T = (Vu, Eu) |
| 開き配置 | Open Configuration | Y° |
| 閉じ配置 | Closed Configuration | Y^c |
| 縫い合わせ進捗 | Stitching Progress | η |
| シーム | Seam | C, C' |
| 特異点 | Singularity | — |
| 縫い合わせ進捗パラメータ | Closing Parameter | η ∈ [0,1] |

---

*本仕様書 バージョン 0.1 — 2026年3月*  
*論文: "Fabric Tessellation: Realizing Freeform Surfaces by Smocking", Segall et al., ACM TOG 2024*
