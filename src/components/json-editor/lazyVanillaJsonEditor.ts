import { lazy } from 'react'

/** 分入口共享的 vanilla-jsoneditor 懒加载组件，避免重复 chunk 声明 */
const LazyVanillaJsonEditor = lazy(() => import('@/components/json-editor/VanillaJsonEditor'))

export default LazyVanillaJsonEditor
