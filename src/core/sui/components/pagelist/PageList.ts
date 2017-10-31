module junyou {

    export interface PageListOption {
        /**
         * 单元格之间的宽度
         * 
         * @type {number}
         * @memberof PageListOption
         */
        hgap?: number;
        /**
         * 单元格之间的高度
         * 
         * @type {number}
         * @memberof PageListOption
         */
        vgap?: number;
        /**
         * 列表共有几列（最小1最大9999）
         * 
         * @type {number}
         * @memberof PageListOption
         */
        columnCount?: number;

        /**
         * itemrender固定宽度
         * 
         * @type {number}
         * @memberof PageListOption
         */
        itemWidth?: number;

        /**
         * itemrender固定高度
         * 
         * @type {number}
         * @memberof PageListOption
         */
        itemHeight?: number;

        /**
         * 是否为固定尺寸
         * 
         * @type {boolean}
         * @memberof PageListOption
         */
        staticSize?: boolean;

        /**
         * pageList的方向
         * 
         * @type {ScrollDirection}
         * @memberof PageListOption
         */
        type?: ScrollDirection;
        /**
         * 容器
         * 
         * @type {egret.Sprite}
         * @memberof PageListOption
         */
        con?: egret.Sprite;
    }

    export class PageList<T, R extends ListItemRender<T>> extends AbsPageList<T, R> {

        protected _factory: ClassFactory<R>

        /**
         * 根据render的最右侧，得到的最大宽度
         */
        protected _w: number;

        /**
         * 根据render的最下方，得到的最大高度
         */
        protected _h: number;

        /**
         * 水平间距
         * 
         * @protected
         * @type {number}
         */
        protected _hgap: number;

        /**
         * 垂直间距
         * 
         * @protected
         * @type {number}
         */
        protected _vgap: number;

        /**
         * 列数
         * 
         * @protected
         * @type {number}
         */
        protected _columncount: number;

        protected _sizeChanged: boolean = false;

        public scroller: Scroller = null;//站位用，便于对Scroller的绑定
        /**0纵向，1横向 */
        private _scrollType: ScrollDirection;

        private _waitForSetIndex: boolean = false;
        private _waitIndex: number;


        private renderChange = false;

        /**
         * itemrender固定宽度
         * 
         * @private
         * @type {number}
         * @memberOf PageList
         */
        private itemWidth: number;
        /**
         * itemrender固定高度
         * 
         * @private
         * @type {number}
         * @memberOf PageList
         */
        private itemHeight: number;

        private useTweenIndex: boolean;


        private rawDataChanged: boolean;

        /**
         * 是否为固定尺寸
         * 
         * @type {boolean}
         */
        staticSize: boolean;

        private _con: egret.Sprite;
        /**
         * 容器
         * 
         * @readonly
         */
        public get container() {
            return this._con;
        }

        /**
         * Creates an instance of PageList.
         * @param {ClassFactory<R> | Creator<R>} renderfactory 
         * @param {PageListOption} [option] 
         */
        constructor(renderfactory: ClassFactory<R> | Creator<R>, option?: PageListOption) {
            super();
            if (!(renderfactory instanceof ClassFactory)) {
                renderfactory = new ClassFactory(renderfactory);
            }
            this._factory = renderfactory;
            this.init(option);
        }

        protected init(option: PageListOption) {
            option = option || Temp.EmptyObject as PageListOption;
            let { hgap, vgap, type, itemWidth, itemHeight, columnCount, staticSize } = option;
            this.staticSize = staticSize;
            columnCount = ~~columnCount;
            if (columnCount < 1) {
                columnCount = 1;
            }
            this._columncount = columnCount;
            this._hgap = ~~hgap;
            this._vgap = ~~vgap;
            this.itemWidth = itemWidth;
            this.itemHeight = itemHeight;
            this._scrollType = ~~type;
            this.container = option.con || new egret.Sprite();
        }

        public set container(con: egret.Sprite) {
            if (!con) {
                DEBUG && ThrowError(`容器不允许设置空值`)
                return;
            }
            let old = this._con as any;
            if (old != con) {
                if (old) {
                    delete old.$_page;
                    delete old.scrollRect;
                }
                this._con = con;
                (con as any).$_page = this;
                Object.defineProperty(con, "scrollRect", define);
            }
        }

        public displayList(data?: T[]) {
            this._selectedIndex = -1;
            if (this._data != data) {
                this.rawDataChanged = true;
            }
            let nlen = data ? data.length : 0;
            if (this._data) {
                //如果新赋值的数据长度比以前的短，就自动清理掉多出来的item
                let list = this._list;
                let llen = list.length;
                if (nlen < llen) {
                    for (let i = nlen; i < list.length; i++) {
                        let render = list[i];
                        this._removeRender(render);
                    }
                    list.length = nlen;
                }
            }
            this._data = data;
            this._lastRect = undefined;
            if (!nlen) {
                this.dispose();
                this._dataLen = 0;
                this.rawDataChanged = false;
                return;
            }
            this._dataLen = nlen;
            this.initItems();
            if (this.scroller) {
                this.scroller.scrollToHead();
            }
            this.rawDataChanged = false;
        }

        public get data() {
            return this._data;
        }

        /**
         * 根据index使某renderer显示生效
         * 
         * @param {number}  idx
         * @param {boolean} [force]     是否强制执行setData和handleView 
         * @memberOf PageList
         */
        public validateItemByIdx(idx: number, force?: boolean) {
            let renderer = this._get(idx);
            if (force || renderer.view.stage) {
                renderer.data = this._data[idx];
                if (typeof renderer.handleView === "function") {
                    renderer.handleView();
                }
                if (renderer.dataChange) {
                    renderer.dataChange = false;
                }
            }
        }

        /**
         * 使所有renderer显示生效
         * 
         * 
         * @memberOf PageList
         */
        public validateAll() {
            if (this._data) {
                let len = this._data.length;
                for (let i = 0; i < len; i++) {
                    this.validateItemByIdx(i);
                }
            }
        }

        /**
         * 初始化render占据array，不做任何初始化容器操作
         * 
         * @private
         */
        private initItems() {
            let len: number = this._data.length;
            this.doRender(0, len - 1);
            this._sizeChanged = true;
            this.reCalc();
            this.checkViewRect();
        }

        protected onChange() {
            if (!this.itemWidth || !this.itemHeight) {//并未设置固定的宽度高度，需要重新计算坐标
                this._sizeChanged = true;
                this.reCalc();
            }
        }

        protected _get(index: number) {
            let list = this._list;
            let render = list[index];
            if (!render) {
                render = this._factory.get();
                list[index] = render;
                render.on(EventConst.Resize, this.onSizeChange, this);
                render.on(EventConst.ITEM_TOUCH_TAP, this.onTouchItem, this);
            }
            render.index = index;
            return render;
        }

        protected onSizeChange() {
            if (!this._sizeChanged) {
                this._sizeChanged = true;
                this.once(EgretEvent.ENTER_FRAME, this.reCalc, this);
            }
        }

        /**
         * 重新计算Render的坐标
         * 
         * @private
         * @param {number} [start]
         * @param {number} [end]
         * @returns
         */
        protected reCalc() {
            if (!this._sizeChanged) {
                return;
            }
            this._sizeChanged = false;
            let renderList = this._list;
            let len = renderList.length;
            let end = len - 1;
            // let lastrender: R;
            //得到单行/单列最大索引数
            const { itemWidth, itemHeight, _columncount, _hgap, _vgap, staticSize } = this;
            let rowCount = len / _columncount;
            let oy = 0, ox = 0;
            let maxWidth = 0, maxHeight = 0;
            let i = 0;
            for (let r = 0; r <= rowCount; r++) {
                //单行的最大高度
                let lineMaxHeight = 0;
                for (let c = 0; c < _columncount; c++) {
                    if (i > end) {
                        break;
                    }
                    let render = renderList[i++];
                    let v = render.view;

                    let w = 0;
                    if (v) {
                        let size: Size = v;
                        if (staticSize) {
                            let rect = v.suiRawRect;
                            if (rect) {
                                size = rect;
                            }
                        }
                        w = size.width;
                        let vh = size.height;

                        v.x = ox;
                        v.y = oy;

                        let rright = v.x + w;

                        if (maxWidth < rright) {
                            maxWidth = rright;
                        }
                        if (lineMaxHeight < vh) {
                            lineMaxHeight = vh;
                        }
                    }
                    ox += _hgap + (itemWidth || w);
                }
                let mh = oy + lineMaxHeight;
                if (maxHeight < mh) {
                    maxHeight = mh;
                }
                if (i > end) {
                    break;
                }
                ox = 0;
                //偏移量，优先使用itemHeight
                oy += _vgap + (itemHeight || lineMaxHeight);
            }
            if (maxWidth != this._w || maxHeight != this._h) {
                this._w = maxWidth;
                this._h = maxHeight;
                let g = this._con.graphics;
                g.clear();
                g.beginFill(0, 0);
                g.drawRect(0, 0, maxWidth, maxHeight);
                g.endFill();
                this.dispatch(EventConst.Resize);
            }
        }

        public set selectedIndex(value: number) {
            if (this._selectedIndex == value && value >= 0) return;
            if (value < 0) {
                if (this._selectedItem) {
                    this._selectedItem.selected = false;
                    this._selectedItem = undefined;
                }
                this._selectedIndex = value;
                return;
            }
            this._waitIndex = value;
            if (!this._data) {
                this._waitForSetIndex = true;
                return;
            }
            let render: R;
            const renderList = this._list;
            let len_1 = renderList.length - 1;
            if (value > len_1) {//一般PageList控件，索引超过长度，取最后一个
                value = len_1;
            }
            render = this._list[value];
            this.changeRender(render, value);
            let view = render.view;
            if (view && view.stage) {
                this._waitForSetIndex = false;
                this.moveScroll(render);
            } else {
                this._waitForSetIndex = true;
            }

            if (this._waitForSetIndex) {
                this.moveScroll(render);
                //假如列表里有30个项，选中第20个，所以前20个都没有渲染，这边自己设置的rect，并不能引发scroller抛CHANGE事件
                //所以自己抛一下
                //如果已经渲染过，可不用抛
                // this.dispatchEventWith(EventConst.SCROLL_POSITION_CHANGE);
            }
        }

        private moveScroll(render: R) {
            let con = this._con;
            let rect = con.scrollRect;
            if (!rect) return;
            let v = render.view;
            if (!v) {
                if (DEBUG) {
                    ThrowError(`render[${egret.getQualifiedClassName(render)}]没有renderView`);
                }
                return;
            }
            let oldPos: number, endPos: number, max: number;
            if (this._scrollType == ScrollDirection.Vertical) {
                oldPos = rect.y;
                endPos = v.y;
                max = this._h - v.height;

            } else {
                oldPos = rect.x;
                endPos = v.x;
                max = this._w - v.width;
            }


            if (endPos > max) {
                endPos = max;
            }
            if (rect) {
                if (this._scrollType == ScrollDirection.Vertical) {
                    endPos = endPos - rect.height;
                } else {
                    endPos = endPos - rect.width;
                }
                if (endPos < 0) {
                    endPos = 0;
                }
            }

            let scroller = this.scroller;
            if (scroller) {
                scroller.stopTouchTween();
            }
            if (this.useTweenIndex) {

                let tween = Global.getTween(this, null, null, true);
                let result = this._scrollType == ScrollDirection.Horizon ? { tweenX: endPos } : { tweenY: endPos };
                tween.to(result, 500, Ease.quadOut);
                if (scroller) {
                    scroller.showBar();
                    tween.call(scroller.hideBar, scroller);
                }
            } else {
                if (scroller) {
                    scroller.doMoveScrollBar(oldPos - endPos);
                }
                if (this._scrollType == ScrollDirection.Vertical) {
                    rect.y = endPos;
                } else {
                    rect.x = endPos;
                }
                con.scrollRect = rect;
            }
        }
        public get tweenX() {
            let rect = this._con.scrollRect;
            return rect ? rect.x : 0;
        }
        public set tweenX(value: number) {
            let con = this._con;
            let rect = con.scrollRect || new egret.Rectangle(NaN);
            if (value != rect.x) {
                let delta = value - rect.x;
                rect.x = value;
                const scroller = this.scroller;
                if (scroller) {
                    scroller.doMoveScrollBar(delta)
                }
                con.scrollRect = rect;
            }
        }

        public get tweenY() {
            let rect = this._con.scrollRect;
            return rect ? rect.y : 0;
        }
        public set tweenY(value: number) {
            let con = this._con;
            let rect = con.scrollRect || new egret.Rectangle(0, NaN);
            if (value != rect.y) {
                let delta = value - rect.y;
                rect.y = value;
                const scroller = this.scroller;
                if (scroller) {
                    scroller.doMoveScrollBar(delta)
                }
                con.scrollRect = rect;
            }
        }

        public get selectedIndex(): number {
            return this._selectedIndex;
        }

        /**
         * 滚动到指定index
         */
        public tweenToIndex(index: number) {
            this.useTweenIndex = true;
            this.selectedIndex = index;
        }

        public selectItemByData<K extends keyof T>(key: K, value: T[K], useTween: boolean = false) {
            let data = this._data;
            let len = data.length;
            for (let i = 0; i < len; i++) {
                if (key in data[i]) {
                    if (data[i][key] == value) {
                        if (useTween) {
                            this.tweenToIndex(i);
                        } else {
                            this.selectedIndex = i;
                        }
                        break;
                    }
                }
            }
        }

        public get selectedItem() {
            return this._selectedItem;
        }

        /**
         * 更新item数据
         * 
         * @param {number} index (description)
         * @param {*} data (description)
         */
        public updateByIdx(index: number, data: T) {
            let item = this.getItemAt(index);
            if (item) {
                this._data[index] = data;
                if (index >= this._showStart && index <= this._showEnd) {
                    this.doRender(index);
                }
            }
        }


        public removeAt(idx: number) {
            idx = idx >>> 0;
            const list = this._list;
            if (idx < list.length) {
                let item = list[idx];
                list.splice(idx, 1);
                this._data.splice(idx, 1);
                this._removeRender(item);
            }
        }

        public removeItem(item: R) {
            let index = this._list.indexOf(item);
            if (index != -1) {
                this.removeAt(index);
            }
        }

        protected _removeRender(item: R) {
            item.data = undefined;
            removeDisplay(item.view);
            item.off(EventConst.Resize, this.onSizeChange, this);
            item.off(EventConst.ITEM_TOUCH_TAP, this.onTouchItem, this);
            item.dispose();
            if (!this.renderChange) {
                this.renderChange = true;
                this.once(EgretEvent.ENTER_FRAME, this.refreshByRemoveItem, this);
            }
        }

        private refreshByRemoveItem() {
            if (!this.renderChange) {
                return;
            }
            this.renderChange = false;
            this._sizeChanged = true;
            this.reCalc();
            this.checkViewRect();
        }

        /**
         * 销毁
         * 
         */
        public dispose() {
            this.clear();
        }

        /**
         * 清理
         * 
         */
        public clear() {
            this._con.graphics.clear();
            this._selectedIndex = -1;
            this._data = undefined;
            let list = this._list;
            for (let i = 0; i < list.length; i++) {
                this._removeRender(list[i]);
            }
            list.length = 0;
            this._selectedItem = undefined;
            this._waitForSetIndex = false;
            this._waitIndex = -1;
        }

        /**
         * 在舞台之上的起始索引
         * 
         * @protected
         * @type {number}
         */
        protected _showStart: number;

        /**
         * 在舞台之上的结束索引
         * 
         * @protected
         * @type {number}
         */
        protected _showEnd: number;

        protected _lastRect: egret.Rectangle;

        protected checkViewRect() {
            const _con = this._con;
            let rect = _con.scrollRect;
            let list = this._list;
            let len = list.length;
            let len_1 = len - 1;
            if (!rect) {
                // 应该为全部添加到舞台
                for (let i = 0; i < len; i++) {
                    let render = list[i];
                    let v = render.view;
                    if (v) {
                        _con.addChild(v);
                    }
                }
                this._showStart = 0;
                this._showEnd = len - 1;
                return;
            }
            //设置rect时，检查哪些Render应该在舞台上
            let lastRect = this._lastRect;
            let checkStart: number, inc: boolean;
            if (lastRect) {
                //检查滚动方向
                let key1 = "x", key2 = "width";
                if (this._scrollType == ScrollDirection.Vertical) {
                    key1 = "y";
                    key2 = "height";
                }
                let delta = rect[key1] - lastRect[key1];
                if (delta == 0 && rect[key2] == lastRect[key2]) {//没有任何变化
                    if (!this.rawDataChanged) {
                        return;
                    }
                }
                let showStart = this._showStart;
                let showEnd = this._showEnd;
                //先全部从舞台移除
                for (let i = showStart; i <= showEnd; i++) {
                    let render = list[i];
                    if (render) {
                        removeDisplay(render.view);
                    }
                }


                if (delta > 0) {//向大的检查
                    checkStart = showStart;
                    inc = true;
                } else {
                    checkStart = showEnd;
                    inc = false;
                }
                lastRect[key1] = rect[key1];
                lastRect[key2] = rect[key2];
            } else {
                if (!len) {
                    return;
                }
                lastRect = rect.clone();
                this._lastRect = lastRect;
                checkStart = 0;
                inc = true;
            }
            let first: R, last: R, fIdx: number, lIdx: number;
            let tmp = Temp.SharedArray3;
            tmp.length = 0;
            if (inc) {
                fIdx = 0;
                lIdx = len_1;
                /**
                 * 
                 * 
                 *   ├────────┤
                 *   │render0 │                         以前和scrollRect相交的render0，现在不再相交，从舞台移除
                 *  ┌├────────┤┐───
                 *  ││render1 ││ ↑ scrollRect           以前和scrollRect相交的render1，现在还相交
                 *  │├────────┤│ ↓
                 *  └│render2 │┘───                     以前不和scrollRect相交的render2，现在相交
                 *   ├────────┤
                 * 
                 *  需要从起始点开始找，找到第一个和当前rect相交的render
                 *  直到找到最后一个和rect相交的render，再往后则无需检测
                 */
                for (let i = checkStart; i < len; i++) {
                    if (check(i)) {
                        break;
                    }
                }
                for (let i = 0, tlen = tmp.length; i < tlen; i++) {
                    let v = tmp[i];
                    _con.addChild(v);
                }
                this._showStart = fIdx;
                this._showEnd = lIdx;
            } else {
                fIdx = len_1;
                lIdx = 0;
                for (let i = checkStart; i >= 0; i--) {
                    if (check(i)) {
                        break;
                    }
                }
                for (let i = tmp.length - 1; i >= 0; i--) {
                    let v = tmp[i];
                    _con.addChild(v);
                }
                this._showStart = lIdx;
                this._showEnd = fIdx;
            }
            tmp.length = 0;
            return;
            function check(i) {
                let render = list[i];
                let v = render.view;
                if (v) {
                    if (intersects(v, rect)) {
                        if (!first) {
                            first = render;
                            fIdx = i;
                        }
                        tmp.push(v);
                    } else {
                        if (first) {
                            last = render;
                            lIdx = i;
                            return true;
                        }
                    }
                }
            }
        }
    }

    const define = {
        set(rect: egret.Rectangle) {
            egret.Sprite.prototype.$setScrollRect.call(this, rect);
            this.$_page.checkViewRect();
        },
        get() {
            return this.$scrollRect;
        },
        configurable: true
    }
}