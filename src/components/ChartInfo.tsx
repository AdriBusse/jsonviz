import { Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { getMetricDescription } from '../utils/metrics'

type Props = { k: string; metricBase: string }

export default function ChartInfo({ k, metricBase }: Props) {
  const desc = getMetricDescription(`${metricBase}@k`)
  return (
    <span>
      Showing <code>{metricBase}</code> across k for data key <code>{k}</code>
      {desc && (
        <Tooltip title={desc}>
          <InfoCircleOutlined style={{ marginLeft: 6 }} />
        </Tooltip>
      )}
    </span>
  )
}
