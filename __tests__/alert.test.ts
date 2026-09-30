import {Alert, Platform} from 'react-native';
import {confirmDestructive, showAlert} from '../src/utils/alert';

describe('showAlert on native', () => {
  beforeEach(() => {
    (Platform as any).OS = 'ios';
  });

  it('shows a native Alert with the given title and message', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    showAlert('Could not save task', 'Please check your connection.');

    expect(alertSpy).toHaveBeenCalledWith(
      'Could not save task',
      'Please check your connection.',
    );
    alertSpy.mockRestore();
  });
});

describe('showAlert on web', () => {
  const originalAlert = (globalThis as any).alert;

  beforeEach(() => {
    (Platform as any).OS = 'web';
  });

  afterEach(() => {
    (globalThis as any).alert = originalAlert;
  });

  it('falls back to window.alert with the title and message combined', () => {
    const webAlertSpy = jest.fn();
    (globalThis as any).alert = webAlertSpy;

    showAlert('Could not save task', 'Please check your connection.');

    expect(webAlertSpy).toHaveBeenCalledWith(
      'Could not save task\n\nPlease check your connection.',
    );
  });

  it('does not throw when window.alert is unavailable', () => {
    delete (globalThis as any).alert;

    expect(() => showAlert('Could not save task')).not.toThrow();
  });
});

describe('confirmDestructive on native', () => {
  beforeEach(() => {
    (Platform as any).OS = 'ios';
  });

  it('shows a Cancel/destructive-action native Alert and runs onConfirm when the destructive button is pressed', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmDestructive('Delete task?', 'Buy milk', 'Delete', onConfirm);

    expect(alertSpy).toHaveBeenCalledWith('Delete task?', 'Buy milk', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: onConfirm},
    ]);
    alertSpy.mockRestore();
  });
});

describe('confirmDestructive on web', () => {
  const originalConfirm = (globalThis as any).confirm;

  beforeEach(() => {
    (Platform as any).OS = 'web';
  });

  afterEach(() => {
    (globalThis as any).confirm = originalConfirm;
  });

  it('runs onConfirm when window.confirm returns true', () => {
    (globalThis as any).confirm = jest.fn(() => true);
    const onConfirm = jest.fn();

    confirmDestructive('Delete task?', 'Buy milk', 'Delete', onConfirm);

    expect((globalThis as any).confirm).toHaveBeenCalledWith(
      'Delete task?\n\nBuy milk',
    );
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not run onConfirm when window.confirm returns false', () => {
    (globalThis as any).confirm = jest.fn(() => false);
    const onConfirm = jest.fn();

    confirmDestructive('Delete task?', 'Buy milk', 'Delete', onConfirm);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not throw and does not run onConfirm when window.confirm is unavailable', () => {
    delete (globalThis as any).confirm;
    const onConfirm = jest.fn();

    expect(() =>
      confirmDestructive('Delete task?', 'Buy milk', 'Delete', onConfirm),
    ).not.toThrow();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
