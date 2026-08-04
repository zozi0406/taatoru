import * as Network from 'expo-network';

interface ConnectivitySubscription {
  remove(): void;
}

export function observeConnectivity(
  listener: (connected: boolean) => void,
): ConnectivitySubscription {
  let active = true;
  let subscription: ConnectivitySubscription | null = null;
  const attach = (network?: Network.NetworkState) => {
    if (!active) return;
    listener(network !== undefined && isOnline(network));
    subscription = Network.addNetworkStateListener((nextNetwork) => {
      if (active) listener(isOnline(nextNetwork));
    });
  };

  void Network.getNetworkStateAsync().then(attach, () => {
    attach({ isConnected: false, isInternetReachable: false });
  });

  return {
    remove: () => {
      active = false;
      subscription?.remove?.();
    },
  };
}

function isOnline(network: Network.NetworkState): boolean {
  return (
    network.isConnected !== false &&
    network.isInternetReachable !== false
  );
}
