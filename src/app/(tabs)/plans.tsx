import { useT } from '@/i18n';
import { Header, Screen } from '@/ui/kit';

export default function Plans() {
  const t = useT();
  return <Screen header={<Header title={t('tab.plans')} />}>{null}</Screen>;
}
