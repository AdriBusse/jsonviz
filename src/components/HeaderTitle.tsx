import { Typography } from 'antd'

type Props = {
  isDark: boolean
  title?: string
}

export default function HeaderTitle({ isDark, title = 'Benchmark JSON Visualizer' }: Props) {
  return (
    <div>
      <Typography.Title level={2} style={{ margin: 0, color: isDark ? '#bbb' : '#444' }}>
        {title}
      </Typography.Title>
    </div>
  )
}
