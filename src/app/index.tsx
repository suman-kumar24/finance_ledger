import { Redirect } from 'expo-router';

import { useSettings } from '@/hooks/useSettings';

export default function Index() {
  const { onboarded } = useSettings();
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
